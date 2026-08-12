function siteUrl() {
  return (
    process.env.URL ??
    process.env.DEPLOY_PRIME_URL ??
    process.env.NEXT_PUBLIC_SITE_URL
  );
}

export default async () => {
  const url = siteUrl();
  const secret = process.env.ASIA_IMPORT_CRON_SECRET ?? process.env.OLIST_CRON_SECRET;

  if (!url || !secret) {
    console.log(
      "Asia Import scheduled sync skipped: missing URL or cron secret.",
    );
    return new Response(null, { status: 204 });
  }

  const response = await fetch(`${url}/admin/api/asia/rotina`, {
    method: "POST",
    headers: {
      "x-asia-cron-secret": secret,
    },
  });

  const body = await response.text();
  console.log(`Asia Import scheduled sync: ${response.status} ${body}`);

  return new Response(null, { status: 204 });
};

export const config = {
  schedule: "*/10 * * * *",
};
