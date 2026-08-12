function siteUrl() {
  return (
    process.env.URL ??
    process.env.DEPLOY_PRIME_URL ??
    process.env.NEXT_PUBLIC_SITE_URL
  );
}

export default async () => {
  const url = siteUrl();
  const secret = process.env.OLIST_CRON_SECRET;

  if (!url || !secret) {
    console.log("Olist scheduled sync skipped: missing URL or OLIST_CRON_SECRET.");
    return new Response(null, { status: 204 });
  }

  const response = await fetch(`${url}/admin/api/olist/rotina`, {
    method: "POST",
    headers: {
      "x-olist-cron-secret": secret,
    },
  });

  const body = await response.text();
  console.log(`Olist scheduled sync: ${response.status} ${body}`);

  return new Response(null, { status: 204 });
};

export const config = {
  schedule: "@hourly",
};
