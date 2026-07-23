import { onRequest as __api_spotify___path___js_onRequest } from "C:\\Users\\acg68\\Desktop\\ColdFusion\\coldfusion\\functions\\api\\spotify\\[[path]].js"

export const routes = [
    {
      routePath: "/api/spotify/:path*",
      mountPath: "/api/spotify",
      method: "",
      middlewares: [],
      modules: [__api_spotify___path___js_onRequest],
    },
  ]