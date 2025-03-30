import { listSheetsAndFetchData, updateSheetRow } from "@dobuki/google-sheet-db";
import { createFetchFromSheet, createUpdateSheet, createNoPromoPage, findPromoForUid, redeemNextPromo, retrievePromoData, WorkerHeaders, } from "@dobuki/promo-codes";

const REGEX_PROMO = /^\/promo\/([^/]+)(\/(redeem)?)?$/;

export default {
  async fetch(request: Request, env: any): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/favicon.ico') {
      const favicon = generateFavicon();
      return new Response(favicon, {
        headers: {
          'Content-Type': 'image/x-icon',
          'Cache-Control': 'public, max-age=86400',
        }
      });
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
          //  POST /promo/app.id/redeem
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
          //  GET /promo/app.id/redeem
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
        return Response.redirect(`/promo/${app}`, 302);
      } else {
        //  GET /promo/app.id
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
          return new Response(promoInfo?.createPage(`/promo/${app}/redeem`) ?? createNoPromoPage({ appId: app }), {
            headers,
          });
        }
      }
    }

    return new Response("Hello, World!", {
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

function generateFavicon() {
  return new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 16, 0, 0, 0, 16, 8, 6, 0, 0, 0, 42, 187, 137, 0, 0, 0, 4, 73, 68, 65, 84, 120, 94, 99, 96, 96, 96, 96, 96, 64, 4, 255, 242, 1, 96, 128, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130
  ]);
}
