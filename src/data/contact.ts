export const scxContact = {
  whatsappNumber: "5547992574007",
  whatsappDisplay: "(47) 99257-4007",
  email: "contato@scxlaser.com.br",
  location: "Santa Catarina - Brasil",
};

export function scxWhatsappUrl(message?: string) {
  const baseUrl = `https://wa.me/${scxContact.whatsappNumber}`;

  if (!message) {
    return baseUrl;
  }

  return `${baseUrl}?text=${encodeURIComponent(message)}`;
}
