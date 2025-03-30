import { listSheetsAndFetchData, updateSheetRow } from "@dobuki/google-sheet-db";
import { createFetchFromSheet, createUpdateSheet, createNoPromoPage, findPromoForUid, redeemNextPromo, retrievePromoData, WorkerHeaders, } from "@dobuki/promo-codes";

const REGEX_PROMO = /^\/([A-Za-z0-9.-]+)(\/(redeem)?)?$/;

export default {
  async fetch(request: Request, env: any): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/favicon.ico') {
      return Response.redirect("https://i0.wp.com/bignutsgames.com/wp-content/uploads/2024/10/big_nuts_logo.png");
    }

    const [, app, , redeem] = url.pathname.match(REGEX_PROMO) ?? [];
    const SHEET_ID = env.SPREADSHEET_ID;
    const SECRET = env.SECRET_WORD;

    if (app) {
      const credentials = env.SHEETS_SERVICE_KEY_JSON;
      const fetchPromo = createFetchFromSheet(SHEET_ID, app, credentials, listSheetsAndFetchData);
      const workerHeaders = new WorkerHeaders(request.headers);
      const cookieStore = workerHeaders.getCookieStore();
      if (redeem) {
        if (request.method === "POST") {
          //  POST /app.id/redeem
          const updatePromo = createUpdateSheet(SHEET_ID, credentials, updateSheetRow);
          const formData = await request.formData();
          const source = formData.get('src')?.toString();

          const promoInfo = await redeemNextPromo(SHEET_ID, {
            sheetName: app,
            app,
            credentials,
            Source: source ?? url.searchParams.get("src") ?? "",
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
            return new Response(promoInfo?.createPage() ?? createNoPromoPage({ appId: app }), {
              headers,
            });
          }
        }
        return Response.redirect(`/${app}`, 302);
      } else {
        //  GET /app.id
        const promoInfo = await retrievePromoData(SHEET_ID, {
          sheetName: app,
          app,
          secret: SECRET,
          user: url.searchParams.get("user") ?? "none",
          credentials,
          fetchPromo,
        }, cookieStore);
        if (url.searchParams.get("json")) {
          const headers = makeHeaders("application/json", workerHeaders.responseCookies);
          return new Response(JSON.stringify(promoInfo), {
            headers,
          });
        } else {
          const headers = makeHeaders("text/html", workerHeaders.responseCookies);
          return new Response(promoInfo?.createPage(`/${app}/redeem`) ?? createNoPromoPage({ appId: app }), {
            headers,
          });
        }
      }
    }

    return new Response("Hello", {
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
