import { Hono } from "hono";
import instance from "./general/instance";
import domainAction from "./general/domain-action";
import security from "./general/security";
import proxyTest from "./general/proxy-test";
import shortcuts from "./general/shortcuts";

const router = new Hono();

router.route("/", instance);
router.route("/", domainAction);
router.route("/", security);
router.route("/", proxyTest);
router.route("/", shortcuts);

export default router;
