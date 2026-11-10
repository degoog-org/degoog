import { Hono } from "hono";
import instance from "./general/instance";
import domainAction from "./general/domain-action";
import security from "./general/security";
import proxyTest from "./general/proxy-test";
import shortcuts from "./general/shortcuts";
import updateCheck from "./general/update-check";
import logos from "./general/logos";

const router = new Hono();

router.route("/", instance);
router.route("/", domainAction);
router.route("/", security);
router.route("/", proxyTest);
router.route("/", shortcuts);
router.route("/", updateCheck);
router.route("/", logos);

export default router;
