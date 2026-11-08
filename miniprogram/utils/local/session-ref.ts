/** 页面共用的会话取用入口。页面不直接 new，只从 app 拿同一个实例。 */
import { ControlSession } from "../control/session";

interface AppLike {
  globalData: { session: ControlSession };
}

export function getSession(): ControlSession {
  const app = getApp<AppLike>();
  return app.globalData.session;
}
