import type { Metadata } from "next";
import { ContactForm } from "@/components/ContactForm";

export const metadata: Metadata = {
  title: "Contact Us",
  description: "Get in touch with the HereForAds team.",
};

export default function ContactPage() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        Contact us
      </h1>
      <ContactForm
        intro={
          <p className="mt-2 text-sm text-zinc-600">
            Questions, feedback, or something not working? Send us a message and
            we&rsquo;ll get back to you by email.
          </p>
        }
      />
    </div>
  );
}
