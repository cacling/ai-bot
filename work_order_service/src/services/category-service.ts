/**
 * category-service.ts — 分类目录管理
 */
import { db, workItemCategories, eq, and } from "../db.js";
import type { AllowedChildRule, WorkItemType } from "../types.js";

/**
 * 列出分类（支持按 type / parent_code / status 筛选）
 */
export async function listCategories(filters?: {
  type?: string;
  parent_code?: string;
  status?: string;
}) {
  const conditions = [];
  if (filters?.type) conditions.push(eq(workItemCategories.type, filters.type));
  if (filters?.parent_code) conditions.push(eq(workItemCategories.parent_code, filters.parent_code));
  conditions.push(eq(workItemCategories.status, filters?.status ?? 'active'));

  return db.select().from(workItemCategories)
    .where(conditions.length === 1 ? conditions[0] : and(...conditions))
    .all();
}

/**
 * 获取单个分类
 */
export async function getCategoryByCode(code: string) {
  return db.select().from(workItemCategories)
    .where(eq(workItemCategories.code, code))
    .get();
}

/**
 * 从分类解析默认配置
 */
export async function resolveCategoryDefaults(categoryCode: string) {
  const cat = await getCategoryByCode(categoryCode);
  if (!cat || cat.status !== 'active') return null;

  return {
    type: cat.type as WorkItemType,
    default_template_code: cat.default_template_code,
    default_workflow_key: cat.default_workflow_key,
    default_queue_code: cat.default_queue_code,
    default_sla_policy_code: cat.default_sla_policy_code,
    default_priority: cat.default_priority,
    required_fields_schema: cat.required_fields_schema,
    allowed_child_rules: parseChildRules(cat.allowed_child_rules_json),
  };
}

/**
 * 校验父子关系是否合法
 *
 * 检查父分类的 allowed_child_rules_json 是否允许创建指定类型/分类的子项。
 * 如果父项没有 category_code 或没有 allowed_child_rules，默认允许（向后兼容）。
 */
export async function validateParentChildRelation(
  parentCategoryCode: string | null | undefined,
  childType: WorkItemType,
  childCategoryCode?: string | null,
): Promise<{ valid: boolean; error?: string }> {
  if (!parentCategoryCode) return { valid: true }; // 无分类时不做约束

  const parent = await getCategoryByCode(parentCategoryCode);
  if (!parent) return { valid: true }; // 父分类不存在也放行（兼容旧数据）

  const rules = parseChildRules(parent.allowed_child_rules_json);
  if (rules.length === 0) return { valid: true }; // 无规则不约束

  // 找到匹配 child_type 的规则
  const matchingRules = rules.filter(r => r.child_type === childType);
  if (matchingRules.length === 0) {
    return { valid: false, error: `分类 "${parentCategoryCode}" 不允许创建 ${childType} 子项` };
  }

  // 如果子项有 category_code，校验是否在允许列表中
  if (childCategoryCode) {
    const allowed = matchingRules.some(r =>
      r.child_categories.length === 0 || r.child_categories.includes(childCategoryCode),
    );
    if (!allowed) {
      return { valid: false, error: `分类 "${parentCategoryCode}" 不允许创建子分类 "${childCategoryCode}"` };
    }
  }

  return { valid: true };
}

// ── 内部辅助 ────────────────────────────────────────────────────────────────

function parseChildRules(json: string | null): AllowedChildRule[] {
  if (!json) return [];
  try {
    return JSON.parse(json) as AllowedChildRule[];
  } catch {
    return [];
  }
}
