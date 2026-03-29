/**
 * categories.ts — 分类目录路由
 */
import { Hono } from "hono";
import { listCategories, getCategoryByCode } from "../services/category-service.js";

const app = new Hono();

/** GET / — 列出分类 */
app.get("/", async (c) => {
  const q = c.req.query();
  const items = await listCategories({
    type: q.type,
    parent_code: q.parent_code,
    status: q.status,
  });
  return c.json({ items });
});

/** GET /:code — 分类详情 */
app.get("/:code", async (c) => {
  const cat = await getCategoryByCode(c.req.param("code"));
  if (!cat) return c.json({ error: "未找到" }, 404);
  return c.json(cat);
});

export default app;
