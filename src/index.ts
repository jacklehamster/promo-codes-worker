export default {
  async fetch(request: Request): Promise<Response> {
    return new Response("Hello, World!", {
      headers: { "Content-Type": "text/plain" },
    });
  },
};
