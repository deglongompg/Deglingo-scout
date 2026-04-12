import { onRequestGet as __api_sorare_cards_js_onRequestGet } from "C:\\Users\\Dekstop\\Desktop\\Deglingo Scout\\Deglingo Scout\\deglingo-scout-app\\functions\\api\\sorare\\cards.js"
import { onRequestOptions as __api_sorare_cards_js_onRequestOptions } from "C:\\Users\\Dekstop\\Desktop\\Deglingo Scout\\Deglingo Scout\\deglingo-scout-app\\functions\\api\\sorare\\cards.js"
import { onRequestGet as __auth_sorare_callback_js_onRequestGet } from "C:\\Users\\Dekstop\\Desktop\\Deglingo Scout\\Deglingo Scout\\deglingo-scout-app\\functions\\auth\\sorare\\callback.js"
import { onRequestGet as __auth_sorare_logout_js_onRequestGet } from "C:\\Users\\Dekstop\\Desktop\\Deglingo Scout\\Deglingo Scout\\deglingo-scout-app\\functions\\auth\\sorare\\logout.js"

export const routes = [
    {
      routePath: "/api/sorare/cards",
      mountPath: "/api/sorare",
      method: "GET",
      middlewares: [],
      modules: [__api_sorare_cards_js_onRequestGet],
    },
  {
      routePath: "/api/sorare/cards",
      mountPath: "/api/sorare",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_sorare_cards_js_onRequestOptions],
    },
  {
      routePath: "/auth/sorare/callback",
      mountPath: "/auth/sorare",
      method: "GET",
      middlewares: [],
      modules: [__auth_sorare_callback_js_onRequestGet],
    },
  {
      routePath: "/auth/sorare/logout",
      mountPath: "/auth/sorare",
      method: "GET",
      middlewares: [],
      modules: [__auth_sorare_logout_js_onRequestGet],
    },
  ]