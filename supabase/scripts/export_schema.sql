-- 导出线上数据库结构(只读,不改任何东西,不导出任何用户数据)。
--
-- 用法:Supabase 后台 → SQL Editor → New query,把整个文件粘进去 → Run →
-- 结果区右上角 Export → Download CSV。
--
-- 输出按类别每类一行(section / ddl 两列),ddl 是可以直接执行的 SQL 文本。
-- 用途:
--   1. 整理 / 核对 supabase/migrations/ 时,以这里导出的线上结构为准;
--   2. 新站点跑完迁移后,在新项目里再跑一遍,跟老项目的结果对比,确认两边一样。
--
-- 范围:public(以及自己建的其它 schema)里的类型、序列、表、约束、索引、函数、
-- 视图、触发器、RLS 策略、表/列/函数/序列权限;storage 的 bucket 设置和策略;
-- auth.users / storage.objects 上调用我们自己函数的触发器;Realtime publication。
-- 不包括 Supabase 自带的 schema(auth、storage、extensions、realtime 等)本身的结构。
--
-- 下面先建几个临时(temp)视图和一个临时函数:只存在于这次连接,断开后自动消失,
-- 不会出现在数据库结构里。每一类单独执行,某一类没有权限读(比如 storage 的表归
-- Supabase 自己的角色所有)时,那一行会写 "-- ERROR ...",其它类照常导出。

create or replace temp view hfa_scope as
  select n.oid, n.nspname
  from pg_namespace n
  where n.nspname not like 'pg\_%'
    and n.nspname not in (
      'information_schema', 'auth', 'storage', 'extensions', 'graphql', 'graphql_public',
      'realtime', '_realtime', 'supabase_functions', 'supabase_migrations', 'vault',
      'pgsodium', 'pgsodium_masks', 'net', 'cron', 'pgbouncer', '_analytics', 'pgmq', 'pgtle'
    )
    and not exists (
      select 1 from pg_depend d
      where d.classid = 'pg_namespace'::regclass and d.objid = n.oid and d.deptype = 'e'
    );

-- 扩展自带的对象(比如装在 public 里的扩展函数)不算我们的
create or replace temp view hfa_ext as
  select d.classid, d.objid from pg_depend d where d.deptype = 'e';

create or replace temp view hfa_tbls as
  select c.oid, c.relname, c.relkind, n.nspname
  from pg_class c
  join hfa_scope n on n.oid = c.relnamespace
  where c.relkind in ('r', 'p')
    and not exists (select 1 from hfa_ext e where e.classid = 'pg_class'::regclass and e.objid = c.oid);

create or replace temp view hfa_roles as
  select 0::oid as oid, 'public'::text as name
  union all
  select oid, quote_ident(rolname) from pg_roles;

create or replace function pg_temp.hfa_section(p_section text, p_sql text)
returns text
language plpgsql
as $f$
declare
  r text;
begin
  execute p_sql into r;
  return r;
exception when others then
  return format('-- ERROR in %s: %s (SQLSTATE %s)', p_section, sqlerrm, sqlstate);
end
$f$;

select section, ddl
from (values

-- 0. 基本信息
(0, 'info', pg_temp.hfa_section('info', $q$
  select format(E'-- server_version: %s\n-- exported_at: %s\n-- current_user: %s\n-- schemas: %s',
    current_setting('server_version'), now(), current_user,
    (select string_agg(nspname, ', ' order by nspname) from hfa_scope))
$q$)),

-- 1. 扩展(含 Supabase 默认装的,整理时再挑)
(1, 'extensions', pg_temp.hfa_section('extensions', $q$
  select string_agg(format('-- %s %s (schema %s)', e.extname, e.extversion, n.nspname), E'\n' order by e.extname)
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
$q$)),

-- 2. 自建 schema
(2, 'schemas', pg_temp.hfa_section('schemas', $q$
  select string_agg(format('create schema if not exists %I;', nspname), E'\n' order by nspname)
  from hfa_scope where nspname <> 'public'
$q$)),

-- 3. 枚举类型
(3, 'enums', pg_temp.hfa_section('enums', $q$
  select string_agg(ddl, E'\n' order by name)
  from (
    select format('%I.%I', n.nspname, t.typname) as name,
      format('create type %I.%I as enum (%s);', n.nspname, t.typname,
        (select string_agg(quote_literal(e.enumlabel), ', ' order by e.enumsortorder)
         from pg_enum e where e.enumtypid = t.oid)) as ddl
    from pg_type t join hfa_scope n on n.oid = t.typnamespace
    where t.typtype = 'e'
      and not exists (select 1 from hfa_ext x where x.classid = 'pg_type'::regclass and x.objid = t.oid)
  ) s
$q$)),

-- 3b. 其它自定义类型(domain / composite / range),只列出来,整理时手写
(4, 'other_types', pg_temp.hfa_section('other_types', $q$
  select string_agg(format('-- %s.%s typtype=%s', n.nspname, t.typname, t.typtype), E'\n')
  from pg_type t join hfa_scope n on n.oid = t.typnamespace
  where t.typtype in ('d', 'c', 'r', 'm')
    and (t.typtype <> 'c' or (select c.relkind from pg_class c where c.oid = t.typrelid) = 'c')
    and not exists (select 1 from hfa_ext x where x.classid = 'pg_type'::regclass and x.objid = t.oid)
$q$)),

-- 4. 序列(identity 列自带的序列不算)
(5, 'sequences', pg_temp.hfa_section('sequences', $q$
  select string_agg(ddl, E'\n' order by name)
  from (
    select c.relname as name,
      format('create sequence %I.%I as %s increment by %s minvalue %s maxvalue %s start with %s cache %s%s;%s',
        n.nspname, c.relname, format_type(s.seqtypid, null), s.seqincrement, s.seqmin, s.seqmax,
        s.seqstart, s.seqcache, case when s.seqcycle then ' cycle' else '' end,
        coalesce((
          select format(E'\n-- owned by %s.%I', dc.oid::regclass, a.attname)
          from pg_depend d
          join pg_class dc on dc.oid = d.refobjid
          join pg_attribute a on a.attrelid = d.refobjid and a.attnum = d.refobjsubid
          where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'a'
        ), '')) as ddl
    from pg_class c
    join hfa_scope n on n.oid = c.relnamespace
    join pg_sequence s on s.seqrelid = c.oid
    where c.relkind = 'S'
      and not exists (
        select 1 from pg_depend d
        where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'i'
      )
  ) s
$q$)),

-- 5. 表(只有列;约束、索引在后面)
(6, 'tables', pg_temp.hfa_section('tables', $q$
  select string_agg(ddl, E'\n\n' order by name)
  from (
    select t.nspname || '.' || t.relname as name,
      format(E'create table %I.%I (\n%s\n)%s;', t.nspname, t.relname,
        (select string_agg(
            format('  %I %s', a.attname, format_type(a.atttypid, a.atttypmod))
            || case when a.attidentity = 'a' then ' generated always as identity'
                    when a.attidentity = 'd' then ' generated by default as identity' else '' end
            || case when a.attgenerated = 's' then ' generated always as (' || pg_get_expr(d.adbin, d.adrelid) || ') stored'
                    when d.adbin is not null then ' default ' || pg_get_expr(d.adbin, d.adrelid) else '' end
            || case when a.attnotnull then ' not null' else '' end,
            E',\n' order by a.attnum)
         from pg_attribute a
         left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
         where a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped),
        case when t.relkind = 'p' then ' partition by ' || pg_get_partkeydef(t.oid) else '' end) as ddl
    from hfa_tbls t
  ) s
$q$)),

-- 6. 约束:主键/唯一/排他/检查(外键单独一段,放最后建)
(7, 'constraints', pg_temp.hfa_section('constraints', $q$
  select string_agg(ddl, E'\n' order by name)
  from (
    select t.nspname || '.' || t.relname || ' '
      || case con.contype when 'p' then '1' when 'u' then '2' when 'x' then '3' else '4' end
      || ' ' || con.conname as name,
      format('alter table %I.%I add constraint %I %s;', t.nspname, t.relname, con.conname,
        pg_get_constraintdef(con.oid)) as ddl
    from pg_constraint con join hfa_tbls t on t.oid = con.conrelid
    where con.contype in ('p', 'u', 'c', 'x') and con.conislocal
  ) s
$q$)),

(8, 'foreign_keys', pg_temp.hfa_section('foreign_keys', $q$
  select string_agg(ddl, E'\n' order by name)
  from (
    select t.nspname || '.' || t.relname || ' ' || con.conname as name,
      format('alter table %I.%I add constraint %I %s;', t.nspname, t.relname, con.conname,
        pg_get_constraintdef(con.oid)) as ddl
    from pg_constraint con join hfa_tbls t on t.oid = con.conrelid
    where con.contype = 'f' and con.conislocal
  ) s
$q$)),

-- 7. 索引(约束自带的索引不重复列)
(9, 'indexes', pg_temp.hfa_section('indexes', $q$
  select string_agg(pg_get_indexdef(i.indexrelid) || ';', E'\n' order by t.nspname, t.relname, ic.relname)
  from pg_index i
  join hfa_tbls t on t.oid = i.indrelid
  join pg_class ic on ic.oid = i.indexrelid
  where not exists (select 1 from pg_constraint con where con.conindid = i.indexrelid and con.conrelid = i.indrelid)
$q$)),

-- 8. 函数 / 存储过程
(10, 'functions', pg_temp.hfa_section('functions', $q$
  select string_agg(pg_get_functiondef(p.oid) || ';', E'\n\n' order by p.proname, p.oid)
  from pg_proc p join hfa_scope n on n.oid = p.pronamespace
  where p.prokind in ('f', 'p')
    and not exists (select 1 from hfa_ext x where x.classid = 'pg_proc'::regclass and x.objid = p.oid)
$q$)),

-- 9. 视图
(11, 'views', pg_temp.hfa_section('views', $q$
  select string_agg(ddl, E'\n\n' order by name)
  from (
    select c.relname as name,
      format(E'create %sview %I.%I%s as\n%s', case c.relkind when 'm' then 'materialized ' else '' end,
        n.nspname, c.relname,
        case when c.reloptions is not null then ' with (' || array_to_string(c.reloptions, ', ') || ')' else '' end,
        pg_get_viewdef(c.oid, true)) as ddl
    from pg_class c join hfa_scope n on n.oid = c.relnamespace
    where c.relkind in ('v', 'm')
      and not exists (select 1 from hfa_ext x where x.classid = 'pg_class'::regclass and x.objid = c.oid)
  ) s
$q$)),

-- 10. 触发器:我们自己表上的
(12, 'triggers', pg_temp.hfa_section('triggers', $q$
  select string_agg(pg_get_triggerdef(tg.oid, true) || ';', E'\n' order by c.relname, tg.tgname)
  from pg_trigger tg
  join pg_class c on c.oid = tg.tgrelid
  where not tg.tgisinternal
    and c.relnamespace in (select oid from hfa_scope)
$q$)),

-- 10b. auth / storage 等 Supabase 表上、调用我们自己函数的触发器(比如新用户注册时建 profile)
(13, 'triggers_on_supabase_tables', pg_temp.hfa_section('triggers_on_supabase_tables', $q$
  select string_agg(pg_get_triggerdef(tg.oid, true) || ';', E'\n' order by c.relname, tg.tgname)
  from pg_trigger tg
  join pg_class c on c.oid = tg.tgrelid
  join pg_proc p on p.oid = tg.tgfoid
  where not tg.tgisinternal
    and c.relnamespace not in (select oid from hfa_scope)
    and p.pronamespace in (select oid from hfa_scope)
$q$)),

-- 11. 行级安全开关
(14, 'rls', pg_temp.hfa_section('rls', $q$
  select string_agg(ddl, E'\n' order by name)
  from (
    select c.oid::regclass::text as name,
      format('alter table %s enable row level security;', c.oid::regclass)
      || case when c.relforcerowsecurity then format(E'\nalter table %s force row level security;', c.oid::regclass) else '' end as ddl
    from pg_class c
    where c.relrowsecurity and c.oid in (select oid from hfa_tbls)
  ) s
$q$)),

-- 12. RLS 策略(我们自己的表)
(15, 'policies', pg_temp.hfa_section('policies', $q$
  select string_agg(ddl, E'\n\n' order by name)
  from (
    select c.oid::regclass::text || ' ' || pol.polname as name,
      format('create policy %I on %s as %s for %s to %s%s%s;',
        pol.polname, c.oid::regclass,
        case when pol.polpermissive then 'permissive' else 'restrictive' end,
        case pol.polcmd when 'r' then 'select' when 'a' then 'insert' when 'w' then 'update'
                        when 'd' then 'delete' else 'all' end,
        (select string_agg(r.name, ', ' order by r.name) from hfa_roles r where r.oid = any (pol.polroles)),
        case when pol.polqual is not null then E'\n  using (' || pg_get_expr(pol.polqual, pol.polrelid) || ')' else '' end,
        case when pol.polwithcheck is not null then E'\n  with check (' || pg_get_expr(pol.polwithcheck, pol.polrelid) || ')' else '' end) as ddl
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    where c.relnamespace in (select oid from hfa_scope)
  ) s
$q$)),

-- 12b. storage 上的 RLS 策略(上传/查看图片的权限)
(16, 'storage_policies', pg_temp.hfa_section('storage_policies', $q$
  select string_agg(ddl, E'\n\n' order by name)
  from (
    select p.tablename || ' ' || p.policyname as name,
      format('create policy %I on %I.%I as %s for %s to %s%s%s;',
        p.policyname, p.schemaname, p.tablename, lower(p.permissive), lower(p.cmd),
        array_to_string(p.roles, ', '),
        case when p.qual is not null then E'\n  using (' || p.qual || ')' else '' end,
        case when p.with_check is not null then E'\n  with check (' || p.with_check || ')' else '' end) as ddl
    from pg_policies p
    where p.schemaname = 'storage'
  ) s
$q$)),

-- 13. 表 / 序列权限:先全部收回,再按线上实际情况授予(这样结果跟线上完全一致)
(17, 'table_grants', pg_temp.hfa_section('table_grants', $q$
  select string_agg(ddl, E'\n' order by name)
  from (
    select c.oid::regclass::text as name,
      format('revoke all on %s %s from public, anon, authenticated, service_role;',
        case c.relkind when 'S' then 'sequence' else 'table' end, c.oid::regclass)
      || coalesce((
        select string_agg(format(E'\ngrant %s on %s %s to %s%s;', g.privs,
                 case c.relkind when 'S' then 'sequence' else 'table' end, c.oid::regclass, g.grantee,
                 case when g.grantable then ' with grant option' else '' end), '' order by g.grantee)
        from (
          select r.name as grantee, a.is_grantable as grantable,
            string_agg(lower(a.privilege_type), ', ' order by a.privilege_type) as privs
          from aclexplode(c.relacl) a join hfa_roles r on r.oid = a.grantee
          where a.grantee <> c.relowner
          group by r.name, a.is_grantable
        ) g), '') as ddl
    from pg_class c join hfa_scope n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p', 'v', 'm', 'S')
      and not exists (select 1 from hfa_ext x where x.classid = 'pg_class'::regclass and x.objid = c.oid)
  ) s
$q$)),

-- 14. 列级权限
(18, 'column_grants', pg_temp.hfa_section('column_grants', $q$
  select string_agg(ddl, E'\n' order by name)
  from (
    select c.oid::regclass::text || ' ' || r.name || ' ' || a.privilege_type as name,
      format('grant %s (%s) on table %s to %s;', lower(a.privilege_type),
        string_agg(quote_ident(att.attname), ', ' order by att.attnum), c.oid::regclass, r.name) as ddl
    from pg_attribute att
    join pg_class c on c.oid = att.attrelid
    join hfa_scope n on n.oid = c.relnamespace
    cross join lateral aclexplode(att.attacl) a
    join hfa_roles r on r.oid = a.grantee
    where att.attacl is not null and att.attnum > 0 and not att.attisdropped
    group by c.oid, r.name, a.privilege_type
  ) s
$q$)),

-- 15. 函数权限(proacl 为空表示默认:PUBLIC 可执行)
(19, 'function_grants', pg_temp.hfa_section('function_grants', $q$
  select string_agg(ddl, E'\n' order by name)
  from (
    select format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) as name,
      case when p.proacl is null then
        format('-- %I.%I(%s): default (execute to public)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))
      else
        format('revoke all on function %I.%I(%s) from public, anon, authenticated, service_role;',
          n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))
        || coalesce((
          select string_agg(format(E'\ngrant execute on function %I.%I(%s) to %s;',
                   n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), r.name), '' order by r.name)
          from aclexplode(p.proacl) a join hfa_roles r on r.oid = a.grantee
          where a.grantee <> p.proowner and a.privilege_type = 'EXECUTE'), '')
      end as ddl
    from pg_proc p join hfa_scope n on n.oid = p.pronamespace
    where p.prokind in ('f', 'p')
      and not exists (select 1 from hfa_ext x where x.classid = 'pg_proc'::regclass and x.objid = p.oid)
  ) s
$q$)),

-- 16. Storage bucket 设置
(20, 'storage_buckets', pg_temp.hfa_section('storage_buckets', $q$
  select string_agg(
    format(E'insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)\nvalues (%L, %L, %s, %s, %s)\non conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;',
      b.id, b.name, case when b.public then 'true' else 'false' end, coalesce(b.file_size_limit::text, 'null'),
      coalesce(quote_literal(b.allowed_mime_types::text) || '::text[]', 'null')),
    E'\n' order by b.id)
  from storage.buckets b
$q$)),

-- 17. Realtime
(21, 'realtime', pg_temp.hfa_section('realtime', $q$
  select string_agg(format('alter publication %I add table %I.%I;', pubname, schemaname, tablename), E'\n' order by tablename)
  from pg_publication_tables
  where schemaname in (select nspname from hfa_scope)
$q$)),

-- 18. 表的 owner 和默认权限(只作核对用)
(22, 'owners_and_default_acl', pg_temp.hfa_section('owners_and_default_acl', $q$
  select
    coalesce((select string_agg(format('-- owner %s: %s', r.rolname, x.list), E'\n')
      from (select c.relowner, string_agg(c.relname, ', ' order by c.relname) as list
            from pg_class c join hfa_scope n on n.oid = c.relnamespace
            where c.relkind in ('r', 'p', 'v', 'm', 'S') group by c.relowner) x
      join pg_roles r on r.oid = x.relowner), '')
    || E'\n' ||
    coalesce((select string_agg(format('-- default acl: role=%s schema=%s type=%s acl=%s',
        pg_get_userbyid(d.defaclrole), coalesce(n.nspname, '*'), d.defaclobjtype, d.defaclacl::text), E'\n')
      from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace
      where n.nspname is null or n.nspname in (select nspname from hfa_scope)), '')
$q$))

) as v(ord, section, ddl)
where ddl is not null and ddl <> ''
order by ord;
