import type { AdType, PricingUnit } from "@/lib/supabase/enums";

// 发布广告位的示例(产品负责人 2026-09-26):很多创作者不知道自己有哪些东西可以当广告位卖。
// 帮助页 /help 列出全部示例,发布/编辑页右侧和 Ad type 旁的"See examples"也用这里的内容。
// 站点是英文的,示例都用英文写;改内容只改这一个文件。

export interface ListingExample {
  id: string;
  /** 一句话的广告位名字,例:"Brand on my clothes"。 */
  name: string;
  /** 对应发布表单里的 Ad type。 */
  adType: AdType;
  /** 建议的计价方式。 */
  pricing: PricingUnit;
  /** 这种广告位适合谁、是什么。 */
  summary: string;
  /** 示例标题,可以照着改。 */
  title: string;
  /** 示例描述,可以照着改。 */
  description: string;
  /** 卖家怎么证明已经交付(标记交付时要填链接)。 */
  proof: string;
  /** 写这类广告位的小建议。 */
  tip: string;
}

export const LISTING_EXAMPLES: ListingExample[] = [
  {
    id: "brand-on-my-clothes",
    name: "Brand on my clothes",
    adType: "static_image_ad",
    pricing: "one_time",
    summary:
      "You wear the brand's name or logo on a T-shirt, shirt, hat or other item and post it. Works for any creator who shows up on camera.",
    title: "Feature Your Brand on My Clothes",
    description: `I'll feature your brand name or logo on my T-shirt, shirt, hat or other wearable item and showcase it in one photo or one short video on my Instagram.

What you get:
• 1 photo or 1 video (up to 30 seconds) with your brand clearly visible
• Your @handle tagged in the post
• The post stays up for at least 30 days

What I need from you: your logo file (PNG or SVG). You can send the item, or I'll print the logo myself.
Delivery: within 5 days of receiving your logo or item.`,
    proof: "The link to the post where the brand is visible.",
    tip: "Say who provides the item, how visible the logo will be, and how long the post stays up.",
  },
  {
    id: "product-placement-in-my-video",
    name: "Product placement in my video",
    adType: "video_product_placement",
    pricing: "one_time",
    summary:
      "The product appears naturally in one of your normal videos — on your desk, in your kitchen, in your hand — without a hard sell.",
    title: "Product Placement in My Next YouTube Video",
    description: `Your product will appear naturally in my next YouTube video (cooking channel, 20k subscribers, avg 8k views per video).

What you get:
• Your product clearly visible on screen for at least 15 seconds
• Brand name in the video description with your link
• The video stays public permanently

Send me the product before filming. I don't read scripts — it will be shown the way I'd use it myself.
Delivery: in my next video, usually within 14 days of receiving the product.`,
    proof: "The link to the published video (and a timestamp where the product appears).",
    tip: "Give real numbers (subscribers, average views) and say how long the product is on screen.",
  },
  {
    id: "brand-logo-in-my-photo",
    name: "Your brand logo in my photo",
    adType: "static_image_ad",
    pricing: "daily",
    summary:
      "A logo or brand name placed inside one of your photos — on a sign, a wall, a mug, a laptop sticker — posted to your feed or story.",
    title: "Your Brand Logo in My Daily Photo",
    description: `Every day I post one lifestyle photo on Instagram (15k followers). Book a day and your logo appears in that day's photo.

What you get:
• Your logo placed in the photo (on a sign, cup, laptop or similar), clearly readable
• Your @handle in the caption
• Photo stays on my feed

Pick your dates on the calendar — one day = one photo.
Delivery: the photo goes up on the booked day.`,
    proof: "The link to that day's post.",
    tip: "Turn on the booking calendar so brands can pick exact days, and say where in the photo the logo will be.",
  },
  {
    id: "mention-your-brand-in-my-video",
    name: "Mention your brand in my video",
    adType: "product_intro_video",
    pricing: "one_time",
    summary:
      "A short spoken mention — \"this video is supported by…\" — at the start, middle or end of a video, with a link in the description.",
    title: "30-Second Brand Mention in My Video",
    description: `I'll mention your brand in my next TikTok video (40k followers).

What you get:
• A 20–30 second spoken mention at the start of the video
• What your brand does, in my own words, plus your key message
• Link or @handle in the caption

Send me 2–3 points you'd like me to mention. I'll share the wording with you before posting.
Delivery: within 7 days.`,
    proof: "The link to the video with the mention.",
    tip: "Say where the mention goes (start, middle, end), how long it is, and whether the brand can approve the wording.",
  },
  {
    id: "product-review-video",
    name: "Product review video",
    adType: "product_test_video",
    pricing: "one_time",
    summary:
      "A whole video about the product: you try it, show how it works and give your honest opinion.",
    title: "Honest Product Review Video on My Channel",
    description: `I'll make a dedicated review video about your product on YouTube (tech reviews, 30k subscribers).

What you get:
• A 5–8 minute video: unboxing, how it works, pros and cons
• Your link at the top of the description
• The video stays public permanently

My review is honest — I don't promise a positive opinion, but I'll tell you before posting if I find a serious problem.
Delivery: within 21 days of receiving the product.`,
    proof: "The link to the published review video.",
    tip: "Say clearly that the review is honest, and how long you need to test the product.",
  },
  {
    id: "brand-on-my-car",
    name: "Brand on my car",
    adType: "static_image_ad",
    pricing: "weekly",
    summary:
      "A sticker or magnet with the brand on your car, for a set number of weeks, with photos to prove it.",
    title: "Your Brand on My Car for a Week",
    description: `I'll put your brand sticker or magnet on the back window of my car. I drive about 300 km a week around Manchester city centre.

What you get:
• Your sticker on my car for the weeks you book
• A photo of the car with your sticker at the start and end of each week
• One Instagram story showing the car

You send the sticker or magnet (max 60 × 30 cm), or I can order one for an extra cost.
Delivery: the sticker goes on the first day of your booking.`,
    proof: "Photos of the car with the sticker, or a link to the story.",
    tip: "Say where you drive, how much, the maximum sticker size, and who pays for the sticker.",
  },
  {
    id: "brand-in-my-artwork",
    name: "Brand in my artwork",
    adType: "sponsored_feature",
    pricing: "one_time",
    summary:
      "For artists and illustrators: the brand, product or logo becomes part of a painting, illustration or craft piece you share.",
    title: "Your Brand in My Next Illustration",
    description: `I'm an illustrator (25k followers on Instagram). I'll include your product or logo in my next original illustration.

What you get:
• Your brand as part of the artwork (not a pasted-on logo)
• A time-lapse video of the drawing process as a Reel
• Your @handle tagged in both posts

You can suggest ideas; I keep final creative control.
Delivery: within 10 days.`,
    proof: "Links to the artwork post and the process video.",
    tip: "Explain how the brand will be part of the art, and who has final say on the design.",
  },
  {
    id: "sponsored-outfit",
    name: "Sponsored outfit",
    adType: "sponsored_feature",
    pricing: "one_time",
    summary:
      "For fashion creators: you style and wear the brand's clothes or accessories in an outfit post, try-on or \"get ready with me\" video.",
    title: "Sponsored Outfit Post or Try-On Video",
    description: `I'll style your clothing or accessories in an outfit post on Instagram (fashion, 35k followers).

What you get:
• 1 carousel post (3–5 photos) or 1 try-on Reel wearing your pieces
• Brand and item names tagged
• Honest styling tips in the caption

You send the items in my size (UK 10 / M). I'll return them if you'd like.
Delivery: within 7 days of receiving the items.`,
    proof: "The link to the outfit post or Reel.",
    tip: "Give your size, the post format, and whether items are returned or kept.",
  },
  {
    id: "brand-shout-out",
    name: "Brand shout-out on my social media",
    adType: "sponsored_feature",
    pricing: "one_time",
    summary:
      "A quick post or story recommending the brand to your followers — the simplest ad to sell.",
    title: "Brand Shout-Out in My Instagram Stories",
    description: `I'll give your brand a shout-out in my Instagram Stories (20k followers, ~2,000 story views).

What you get:
• 3 story frames about your brand
• Your link sticker and @handle
• Saved to a highlight for 7 days

Send me your logo, link and 1–2 things you'd like me to say.
Delivery: within 3 days.`,
    proof: "Screenshots of the stories with view counts, or a link to the highlight.",
    tip: "Say how many story views you usually get — that's what shout-out buyers care about.",
  },
  {
    id: "custom-brand-collaboration",
    name: "Custom brand collaboration",
    adType: "custom",
    pricing: "one_time",
    summary:
      "Anything that doesn't fit above — an event, a series, a giveaway. Buyers will be asked to message you first to agree the details.",
    title: "Custom Brand Collaboration — Let's Talk",
    description: `Have an idea that isn't a standard ad? Let's build it together.

Examples of what I've done:
• A 3-part video series with a skincare brand
• A giveaway on my Instagram (brand provides the prize)
• Wearing a brand's merch at a live event I host

Message me first with your idea and budget. Once we agree, buy this listing at the agreed price.
Delivery: agreed in messages before you buy.`,
    proof: "Links to the content we agreed on.",
    tip: "Ask buyers to message you first, and list past collaborations so they know what's possible.",
  },
];

export const LISTING_EXAMPLES_BY_TYPE = (type: AdType) =>
  LISTING_EXAMPLES.filter((example) => example.adType === type);
