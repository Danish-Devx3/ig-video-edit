import { InstagramVideoForm } from "@/features/instagram/components/form";

export default function HomePage() {
  return (
    <div className="flex flex-col py-6 sm:py-8 px-2 sm:px-4">
      <h1 className="text-balance mb-6 sm:mb-8 text-center text-2xl sm:text-4xl lg:text-5xl font-extrabold leading-tight">
        Instagram Reels Downloader
      </h1>
      <section className="flex flex-col items-center justify-center gap-4 w-full">
        <InstagramVideoForm />
      </section>
    </div>
  );
}
