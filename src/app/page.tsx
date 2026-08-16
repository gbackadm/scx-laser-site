import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { Differentials } from "@/components/Differentials";
import { FinalCTA } from "@/components/FinalCTA";
import { FloatingWhatsApp } from "@/components/FloatingWhatsApp";
import { Footer } from "@/components/Footer";
import { Gallery } from "@/components/Gallery";
import { HowItWorks } from "@/components/HowItWorks";
import { Services } from "@/components/Services";
import { getCurrentAdminSession } from "@/domain/auth/session";
import { getSiteSettings, siteWhatsappUrl } from "@/domain/site/settings";

export default async function Home() {
  const [siteSettings, adminSession] = await Promise.all([
    getSiteSettings(),
    getCurrentAdminSession(),
  ]);
  const whatsappUrl = siteWhatsappUrl(siteSettings);

  return (
    <div className="public-site public-home">
      <Header whatsappUrl={whatsappUrl} showAdminAccess={Boolean(adminSession)} />
      <main>
        <Hero whatsappUrl={whatsappUrl} />
        <Services />
        <Gallery />
        <HowItWorks />
        <Differentials />
        <FinalCTA whatsappUrl={whatsappUrl} />
        <Footer
          email={siteSettings.email}
          location={siteSettings.locationLabel}
          whatsappDisplay={siteSettings.whatsappDisplay}
          whatsappUrl={whatsappUrl}
        />
      </main>
      <FloatingWhatsApp whatsappUrl={whatsappUrl} />
    </div>
  );
}
