export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/auth/firebase-login") {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
      }

      try {
        const body = await request.json();

        return new Response(JSON.stringify({
          ok: true,
          message: "Worker route working",
          received: body ? true : false
        }), {
          headers: { "Content-Type": "application/json" }
        });

      } catch (err) {
        return new Response(JSON.stringify({
          ok: false,
          error: "Invalid JSON"
        }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    // 👇 THIS LINE IS REQUIRED
    return env.ASSETS.fetch(request);
  }
};
