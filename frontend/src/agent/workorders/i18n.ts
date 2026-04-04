/**
 * 工单管理模块 i18n — 双语翻译
 */
import { type Lang } from '../../i18n';
export { type Lang };

interface WoTranslations {
  wo_tab_list: string;
  wo_tab_intakes: string;
  wo_tab_threads: string;
  wo_search_placeholder: string;
  wo_filter_status: string;
  wo_filter_all: string;
  wo_filter_reset: string;
  wo_detail_title: string;
  wo_empty: string;
  wo_loading: string;
  wo_preview_empty: string;
  wo_col_id: string;
  wo_col_title: string;
  wo_col_phone: string;
  wo_col_type: string;
  wo_col_updated: string;
  wo_col_created: string;
  wo_col_source: string;
  wo_col_summary: string;
  wo_col_items: string;
  wo_basic_info: string;
  wo_assignee: string;
  wo_description: string;
  wo_relations: string;
  wo_appointments: string;
  wo_sub_tasks: string;
  wo_timeline: string;
  wo_intake_info: string;
  wo_issue_thread: string;
  wo_work_items: string;
}

export const T: Record<Lang, WoTranslations> = {
  zh: {
    wo_tab_list:          '工单列表',
    wo_tab_intakes:       '线索与草稿',
    wo_tab_threads:       '事项主线',
    wo_search_placeholder: '工单号/标题/手机号',
    wo_filter_status:     '状态',
    wo_filter_all:        '全部',
    wo_filter_reset:      '重置',
    wo_detail_title:      '工单详情',
    wo_empty:             '暂无数据',
    wo_loading:           '加载中…',
    wo_preview_empty:     '选择一条记录查看详情',
    wo_col_id:            '工单 ID',
    wo_col_title:         '标题',
    wo_col_phone:         '手机号',
    wo_col_type:          '类型',
    wo_col_updated:       '更新时间',
    wo_col_created:       '创建时间',
    wo_col_source:        '来源',
    wo_col_summary:       '摘要',
    wo_col_items:         '关联工单数',
    wo_basic_info:        '基本信息',
    wo_assignee:          '处理人',
    wo_description:       '描述',
    wo_relations:         '来源关系',
    wo_appointments:      '关联预约',
    wo_sub_tasks:         '子任务',
    wo_timeline:          '时间线',
    wo_intake_info:       '线索信息',
    wo_issue_thread:      '事项主线',
    wo_work_items:        '关联工单',
  },
  en: {
    wo_tab_list:          'Work Items',
    wo_tab_intakes:       'Intakes & Drafts',
    wo_tab_threads:       'Issue Threads',
    wo_search_placeholder: 'ID / Title / Phone',
    wo_filter_status:     'Status',
    wo_filter_all:        'All',
    wo_filter_reset:      'Reset',
    wo_detail_title:      'Work Item Detail',
    wo_empty:             'No data',
    wo_loading:           'Loading…',
    wo_preview_empty:     'Select a record to preview',
    wo_col_id:            'ID',
    wo_col_title:         'Title',
    wo_col_phone:         'Phone',
    wo_col_type:          'Type',
    wo_col_updated:       'Updated',
    wo_col_created:       'Created',
    wo_col_source:        'Source',
    wo_col_summary:       'Summary',
    wo_col_items:         'Items',
    wo_basic_info:        'Basic Info',
    wo_assignee:          'Assignee',
    wo_description:       'Description',
    wo_relations:         'Relations',
    wo_appointments:      'Appointments',
    wo_sub_tasks:         'Sub Tasks',
    wo_timeline:          'Timeline',
    wo_intake_info:       'Intake Info',
    wo_issue_thread:      'Issue Thread',
    wo_work_items:        'Work Items',
  },
};
