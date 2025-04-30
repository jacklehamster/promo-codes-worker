// import { listSheetsAndFetchData, updateSheetRow } from "@dobuki/google-sheet-db";
// import { createFetchFromSheet, createUpdateSheet, createNoPromoPage, findPromoForUid, redeemNextPromo, retrievePromoData, WorkerHeaders, } from "@dobuki/promo-codes";

const REGEX_PROMO = /^\/([A-Za-z0-9.-]+)(\/(redeem)?)?$/;

export default {
  async fetch(request: Request, env: any): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/favicon.ico') {
      return Response.redirect("https://jacklehamster.github.io/promo-codes/icon.png");
    }

    const [, app, , redeem] = url.pathname.match(REGEX_PROMO) ?? [];
    const SHEET_ID = env.SPREADSHEET_ID;
    const SECRET = env.SECRET_WORD;

    if (app) {
      const { listSheetsAndFetchData } = await import("@dobuki/google-sheet-db");
      const { createFetchFromSheet, WorkerHeaders } = await import("@dobuki/promo-codes");

      const credentials = env.SHEETS_SERVICE_KEY_JSON;
      const fetchPromo = createFetchFromSheet(SHEET_ID, app, credentials, listSheetsAndFetchData);
      const workerHeaders = new WorkerHeaders(request.headers);
      const cookieStore = workerHeaders.getCookieStore();
      if (redeem) {
        if (request.method === "POST") {
          const { updateSheetRow } = await import("@dobuki/google-sheet-db");
          const { createUpdateSheet, redeemNextPromo } = await import("@dobuki/promo-codes");

          //  POST /app.id/redeem
          const updatePromo = createUpdateSheet(SHEET_ID, credentials, updateSheetRow);
          const formData = await request.formData();
          const src = formData.get('src')?.toString() || url.searchParams.get("src") || "";
          const email = formData.get('email')?.toString() || url.searchParams.get("email") || "";

          const promoInfo = await redeemNextPromo(SHEET_ID, {
            sheetName: app,
            app,
            credentials,
            src,
            email,
            secret: SECRET,
            fetchPromo,
            updatePromo,
          }, cookieStore);
          const headers = makeHeaders("application/json", workerHeaders.responseCookies);
          if (url.searchParams.get("json")) {
            return new Response(JSON.stringify(promoInfo ?? {
              message: "No promo available",
            }), { headers });
          } else {
            return new Response('', {
              status: 303,
              headers: {
                ...headers,
                Location: promoInfo ? url.href : `/promo/${app}`
              },
            });
          }
        } else if (request.method === "GET") {
          const { createNoPromoPage, findPromoForUid } = await import("@dobuki/promo-codes");

          //  GET /app.id/redeem
          const promoInfo = await findPromoForUid({
            sheetId: SHEET_ID,
            app,
            secret: SECRET,
            fetchPromo,
          }, cookieStore);
          if (url.searchParams.get("json")) {
            const headers = makeHeaders("application/json", workerHeaders.responseCookies);
            return new Response(JSON.stringify(promoInfo ?? {
              message: "No promo available",
            }), { headers });
          } else if (promoInfo) {
            const headers = makeHeaders("text/html", workerHeaders.responseCookies);
            return new Response(promoInfo?.createPage(url.href) ?? createNoPromoPage({ appId: app }), {
              headers,
            });
          }
        }
        return Response.redirect(`${url.origin}/${app}`, 302);
      } else {
        const cache = await caches.open("promo-cache"); // Named cache
        const cacheKey = new Request(url.toString(), request);
        if (!url.searchParams.get("nocache")) {
          const response = await cache.match(cacheKey);
          if (response) {
            const { initCookies } = await import("@dobuki/promo-codes");
            await initCookies({ sheetId: SHEET_ID, app, secret: SECRET }, cookieStore)
            return new Response(response.body, {
              headers: makeHeaders(url.searchParams.get("json") ? "application/json" : "text/html", workerHeaders.responseCookies),
            });
          }
        }

        const { createNoPromoPage, retrievePromoData } = await import("@dobuki/promo-codes");

        //  GET /app.id
        const promoInfo = await retrievePromoData(SHEET_ID, {
          sheetName: app,
          app,
          secret: SECRET,
          credentials,
          fetchPromo,
        }, cookieStore);
        if (url.searchParams.get("json")) {
          return new Response(JSON.stringify(promoInfo), {
            headers: makeHeaders("application/json", workerHeaders.responseCookies),
          });
        } else {
          //  Store cached page without cookies
          await cache.put(cacheKey, new Response(promoInfo?.createPage(url.href, `/${app}/redeem`) ?? createNoPromoPage({ appId: app }), {
            headers: makeHeaders("text/html", []),
          }));


          const headers = makeHeaders("text/html", workerHeaders.responseCookies);
          return new Response(promoInfo?.createPage(url.href, `/${app}/redeem`) ?? createNoPromoPage({ appId: app }), {
            headers,
          });
        }
      }
    }

    return new Response("Hello World", {
      headers: { "Content-Type": "text/plain" },
    });
  },
};



function makeHeaders(contentType: string, cookies: string[]) {
  const headers = new Headers({
    "Content-Type": contentType,
  });
  cookies.forEach(cookie => {
    headers.append("Set-Cookie", cookie);
  });
  return headers;
}
