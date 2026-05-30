import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { Differentials } from "@/components/Differentials";
import { FinalCTA } from "@/components/FinalCTA";
import { FloatingWhatsApp } from "@/components/FloatingWhatsApp";
import { Footer } from "@/components/Footer";
import { Gallery } from "@/components/Gallery";
import { HowItWorks } from "@/components/HowItWorks";
import { Services } from "@/components/Services";

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <Services />
        <Gallery />
        <HowItWorks />
        <Differentials />
        <FinalCTA />
        <Footer />
      </main>
      <FloatingWhatsApp />
    </>
  );
}
