<template>
  <div class="ai-assistant">
    <!-- 右下角悬浮入口 -->
    <el-badge :value="badgeCount" :hidden="!badgeCount" :max="99" class="ai-fab-badge">
      <button type="button" class="ai-fab" :title="'AI 智能助手'" @click="open">
        <el-icon :size="20"><ChatDotRound /></el-icon>
      </button>
    </el-badge>

    <el-drawer v-model="visible" size="440px" :with-header="false" class="ai-drawer">
      <div class="ai-panel">
        <!-- 头部 -->
        <div class="ai-header">
          <div class="ai-header-title">
            <span class="ai-title">AI 智能助手</span>
            <span v-if="currentTitle" class="ai-conv-title">{{ currentTitle }}</span>
          </div>
          <div class="ai-header-actions">
            <el-dropdown
              v-if="config?.configured"
              trigger="click"
              @visible-change="onHistoryOpen"
              @command="loadConversation"
            >
              <el-button link size="small">历史</el-button>
              <template #dropdown>
                <el-dropdown-menu class="history-menu">
                  <el-dropdown-item
                    v-for="c in conversations"
                    :key="c.id"
                    :command="c.id"
                    :disabled="c.id === conversationId"
                  >
                    <div class="history-item">
                      <div class="history-title">{{ c.title }}</div>
                      <div class="history-time">{{ c.updatedAt }}</div>
                    </div>
                  </el-dropdown-item>
                  <el-dropdown-item v-if="!conversations.length" disabled>
                    暂无历史对话
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-button v-if="config?.configured" link type="primary" size="small" @click="newConversation">
              新对话
            </el-button>
            <el-button v-if="config?.canConfigure" link size="small" @click="openConfig">
              配置
            </el-button>
          </div>
        </div>

        <!-- 配置表单 -->
        <div v-if="showConfig" class="ai-body ai-config">
          <div class="config-tip">
            {{ config?.configured ? '更新 AI 服务配置' : '首次使用需配置模型服务' }}
          </div>
          <el-form label-position="top" size="default" @submit.prevent>
            <el-form-item label="模型服务">
              <el-select
                v-model="configForm.provider"
                placeholder="选择服务商，或选自定义"
                filterable
                style="width: 100%"
                @change="onProviderChange"
              >
                <el-option
                  v-for="p in aiProviderPresets"
                  :key="p.id"
                  :label="p.name"
                  :value="p.id"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="API Key" :required="!config?.configured">
              <el-input
                v-model="configForm.apiKey"
                type="password"
                show-password
                :placeholder="config?.configured ? `当前 ${config?.keyMasked}，留空保持不变` : 'sk-...'"
              />
            </el-form-item>
            <el-form-item label="API 地址">
              <el-input
                v-model="configForm.baseUrl"
                :placeholder="currentPreset?.baseUrl || 'https://api.deepseek.com/v1'"
              />
            </el-form-item>
            <el-form-item label="模型">
              <el-input
                v-model="configForm.model"
                :placeholder="currentPreset?.modelPlaceholder || '填写模型名'"
              />
            </el-form-item>
            <div v-if="currentPreset?.hint" class="config-hint">{{ currentPreset.hint }}</div>
            <div class="config-actions">
              <el-button :loading="testing" @click="testConnection">测试连接</el-button>
              <el-button type="primary" :loading="saving" @click="saveConfig">
                {{ config?.configured ? '保存' : '保存并开始使用' }}
              </el-button>
              <el-button v-if="config?.configured" @click="showConfig = false">返回</el-button>
            </div>
          </el-form>
        </div>

        <!-- 未配置且无权限 -->
        <div v-else-if="!config?.configured" class="ai-body ai-empty">
          <div class="empty-icon"><el-icon :size="28"><ChatDotRound /></el-icon></div>
          <div class="empty-text">
            {{ config?.canConfigure ? '请先配置模型服务后开始使用' : 'AI 服务尚未配置，请联系管理员完成配置' }}
          </div>
          <el-button v-if="config?.canConfigure" type="primary" @click="openConfig">
            去配置
          </el-button>
        </div>

        <!-- 对话区 -->
        <div v-else class="ai-body ai-chat">
          <div ref="scrollRef" class="ai-messages">
            <!-- 缺货汇报 -->
            <div v-if="report" class="report-card">
              <div class="report-head">
                <span class="report-title">{{ report.title }}</span>
                <el-button link type="primary" size="small" :loading="refreshing" @click="refreshReport">
                  刷新
                </el-button>
              </div>
              <div v-if="report.content.length" class="report-body">
                <div v-for="(row, i) in report.content" :key="i" class="report-row">
                  <span class="report-label">{{ row.label }}</span>
                  <span class="report-value num">{{ row.value }}</span>
                </div>
              </div>
              <div v-else class="report-empty">当前无缺货商品</div>
            </div>

            <div v-if="!messages.length" class="chat-hint">
              <div class="hint-title">你好，我是 ERP 智能助手</div>
              <div class="hint-items">
                <div>查询缺货商品、实时库存、库存流水</div>
                <div>补充库存、创建采购订单（需确认后执行）</div>
                <div>请求不明确时，我会先向你确认再操作</div>
              </div>
            </div>

            <template v-for="(msg, idx) in messages" :key="idx">
              <div class="msg-row" :class="msg.role">
                <div v-if="msg.role === 'assistant'" class="msg-avatar">AI</div>
                <div class="msg-content">
                  <div v-if="msg.content" class="msg-bubble">
                    <AiMarkdown v-if="msg.role === 'assistant'" :content="msg.content" />
                    <template v-else>{{ msg.content }}</template>
                  </div>
                  <div
                    v-else-if="thinking && idx === messages.length - 1 && !msg.cards?.length"
                    class="msg-bubble thinking"
                  >
                    正在思考...
                  </div>
                  <AiCards
                    v-if="msg.cards?.length"
                    :cards="msg.cards"
                    @confirm="confirmAction"
                    @cancel="cancelAction"
                    @clarify="clarifyAction"
                  />
                </div>
              </div>
            </template>
          </div>

          <!-- 输入区 -->
          <div class="ai-input">
            <el-input
              v-model="input"
              type="textarea"
              :rows="2"
              resize="none"
              placeholder="输入你的问题，例如：有哪些商品缺货？"
              :disabled="thinking"
              @keydown.enter.exact.prevent="send"
            />
            <div class="input-actions">
              <span class="input-tip">Enter 发送</span>
              <el-button type="primary" :loading="thinking" :disabled="!input.trim()" @click="send">
                发送
              </el-button>
            </div>
          </div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { agentApi } from '@/api';
import AiCards from './AiCards.vue';
import AiMarkdown from './AiMarkdown.vue';
import { aiProviderPresets } from '@/config/ai-providers';
import type { AiCard, AiChatResult, AiConfigView, AiConversationBrief, AiReport } from '@erp/shared';

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  cards?: AiCard[];
}

/** SSE 事件（与后端 /ai-agent/chat 流式协议对应） */
interface SseEvent {
  type: string;
  text?: string;
  card?: AiCard;
  data?: unknown;
}

const visible = ref(false);
const showConfig = ref(false);
const config = ref<AiConfigView | null>(null);
const saving = ref(false);
const testing = ref(false);
const configForm = ref({
  provider: 'deepseek',
  apiKey: '',
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
});

const currentPreset = computed(
  () => aiProviderPresets.find((p) => p.id === configForm.value.provider) ?? aiProviderPresets[aiProviderPresets.length - 1],
);

const messages = ref<ChatMsg[]>([]);
const input = ref('');
const thinking = ref(false);
const conversationId = ref<number | null>(null);
const scrollRef = ref<HTMLElement>();

// 对话历史
const conversations = ref<AiConversationBrief[]>([]);
const currentTitle = ref('');

async function fetchConversations() {
  try {
    conversations.value = await agentApi.conversations();
  } catch {
    conversations.value = [];
  }
}

function onHistoryOpen(visible: boolean) {
  if (visible) fetchConversations();
}

/** 加载历史会话：恢复消息并切换当前会话 */
async function loadConversation(id: number | string) {
  const convId = Number(id);
  if (convId === conversationId.value) return;
  try {
    const msgs = await agentApi.conversationMessages(convId);
    messages.value = msgs;
    conversationId.value = convId;
    const conv = conversations.value.find((c) => c.id === convId);
    currentTitle.value = conv?.title ?? '对话';
    scrollToBottom();
  } catch {
    // 拦截器已提示
  }
}

const report = ref<AiReport | null>(null);
const refreshing = ref(false);
const badgeCount = ref(0);

onMounted(async () => {
  await loadStatus();
});

async function loadStatus() {
  try {
    config.value = await agentApi.status();
    if (config.value?.configured) {
      showConfig.value = false;
      await loadReport();
    }
  } catch {
    config.value = null;
  }
}

async function loadReport() {
  try {
    report.value = await agentApi.latestReport();
    badgeCount.value = report.value?.content.length ?? 0;
  } catch {
    report.value = null;
    badgeCount.value = 0;
  }
}

async function refreshReport() {
  refreshing.value = true;
  try {
    report.value = await agentApi.refreshReport();
    badgeCount.value = report.value?.content.length ?? 0;
  } finally {
    refreshing.value = false;
  }
}

function open() {
  visible.value = true;
  if (!config.value) loadStatus();
}

/** 选择预设：自动填好 API 地址与默认模型 */
function onProviderChange(providerId: string) {
  const preset = aiProviderPresets.find((p) => p.id === providerId);
  if (!preset) return;
  configForm.value.baseUrl = preset.baseUrl;
  if (preset.models.length) configForm.value.model = preset.models[0];
  else configForm.value.model = '';
}

/** 打开配置表单时回显当前已保存的服务配置 */
function openConfig() {
  showConfig.value = true;
  if (config.value?.configured) {
    configForm.value.provider = config.value.provider || 'custom';
    configForm.value.baseUrl = config.value.baseUrl;
    configForm.value.model = config.value.model;
  }
}

function newConversation() {
  conversationId.value = null;
  messages.value = [];
  currentTitle.value = '';
}

function buildPayload(): { apiKey?: string; provider?: string; baseUrl?: string; model?: string } {
  const payload: { apiKey?: string; provider?: string; baseUrl?: string; model?: string } = {
    provider: configForm.value.provider,
  };
  if (configForm.value.apiKey.trim()) payload.apiKey = configForm.value.apiKey.trim();
  if (configForm.value.baseUrl.trim()) payload.baseUrl = configForm.value.baseUrl.trim();
  if (configForm.value.model.trim()) payload.model = configForm.value.model.trim();
  return payload;
}

/** 测试连接：验证 Key/地址/模型可用（不落库） */
async function testConnection() {
  const payload = buildPayload();
  if (!payload.apiKey && !config.value?.configured) {
    ElMessage.warning('请填写 API Key');
    return;
  }
  if (!payload.baseUrl || !payload.model) {
    ElMessage.warning('请填写 API 地址与模型名');
    return;
  }
  testing.value = true;
  try {
    const res = await agentApi.testConfig(payload);
    if (res.ok) ElMessage.success(res.message || '连接成功');
    else ElMessage.error(`配置失败：${res.message || '连接失败'}`);
  } catch {
    // 拦截器已提示错误
  } finally {
    testing.value = false;
  }
}

async function saveConfig() {
  const payload = buildPayload();
  if (!payload.apiKey && !config.value?.configured) {
    ElMessage.warning('请填写 API Key');
    return;
  }
  if (!payload.baseUrl || !payload.model) {
    ElMessage.warning('请填写 API 地址与模型名');
    return;
  }
  saving.value = true;
  try {
    // 保存前先测试，不通过则报"配置失败"并停留在表单
    const test = await agentApi.testConfig(payload);
    if (!test.ok) {
      ElMessage.error(`配置失败：${test.message || '连接失败'}`);
      return;
    }
    config.value = await agentApi.saveConfig(payload);
    configForm.value.apiKey = '';
    showConfig.value = false;
    ElMessage.success('AI 服务配置已保存');
    messages.value = [];
    conversationId.value = null;
    await loadReport();
  } catch {
    // 拦截器已提示错误
  } finally {
    saving.value = false;
  }
}

/** SSE 流式读取：逐行解析 data: {...} 事件 */
async function streamChat(body: string, onEvent: (evt: SseEvent) => void): Promise<void> {
  const token = localStorage.getItem('token') || '';
  let resp: Response;
  try {
    resp = await fetch('/api/ai-agent/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body,
    });
  } catch {
    throw new Error('网络错误');
  }
  if (!resp.ok || !resp.body) throw new Error('请求失败');
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const payload = t.slice(5).trim();
      if (!payload) continue;
      try {
        onEvent(JSON.parse(payload) as SseEvent);
      } catch {
        // 忽略无法解析的行
      }
    }
  }
}

/** 发起流式对话：文本实时追加、卡片实时渲染 */
async function runChat(message: string) {
  // 用 reactive 持有消息对象：push 后仍保持响应式，文本增量才能实时渲染（流式关键）
  const assistantMsg = reactive<ChatMsg>({ role: 'assistant', content: '', cards: [] });
  messages.value.push(assistantMsg);
  thinking.value = true;
  scrollToBottom();
  try {
    await streamChat(
      JSON.stringify({ message, conversationId: conversationId.value ?? undefined }),
      (evt) => {
        if (evt.type === 'text' && evt.text) {
          assistantMsg.content += evt.text;
          scrollToBottom();
        } else if (evt.type === 'card' && evt.card) {
          assistantMsg.cards!.push(evt.card);
          scrollToBottom();
        } else if (evt.type === 'done') {
          conversationId.value = (evt.data as AiChatResult).conversationId;
        } else if (evt.type === 'error') {
          const d = evt.data as { code?: number; message?: string } | undefined;
          if (d?.message?.includes('配置')) {
            void loadStatus().then(() => {
              showConfig.value = true;
            });
          } else {
            assistantMsg.content = assistantMsg.content || `请求失败：${d?.message ?? '请稍后重试'}`;
          }
        }
      },
    );
  } catch {
    assistantMsg.content = assistantMsg.content || '网络错误，请稍后重试。';
  } finally {
    thinking.value = false;
    scrollToBottom();
  }
}

async function send() {
  const text = input.value.trim();
  if (!text || thinking.value) return;
  messages.value.push({ role: 'user', content: text });
  input.value = '';
  await runChat(text);
}

/**
 * 处理确认卡片：确认/取消后把原卡片就地替换（不滚动、不追加末尾消息），
 * 用户在当前视口内立刻看到"已执行/已取消"，不会误解为"还要再点一次"。
 * @returns 是否找到了该卡片并处理
 */
function resolvePendingCard(pendingId: number, newCard: AiCard | null): boolean {
  for (const msg of messages.value) {
    if (msg.cards?.length) {
      const idx = msg.cards.findIndex(
        (c) => c.type === 'confirmation' && c.pendingId === pendingId,
      );
      if (idx >= 0) {
        if (newCard) msg.cards[idx] = newCard;
        else msg.cards.splice(idx, 1);
        return true;
      }
    }
  }
  return false;
}

async function confirmAction(pendingId: number) {
  thinking.value = true;
  try {
    const res = await agentApi.confirm(pendingId);
    const result = (res.result ?? {}) as { orderNo?: string };
    const rows = [
      ...res.preview.rows,
      { label: '状态', value: res.message },
    ];
    const card: AiCard = {
      type: 'result',
      ok: true,
      title: '操作已执行',
      rows,
      link:
        res.toolName === 'create_purchase_order' && result.orderNo
          ? { path: '/purchase/order', label: '前往采购订单页' }
          : undefined,
    };
    // 就地替换原确认卡片；异常情况才追加到末尾
    if (!resolvePendingCard(pendingId, card)) {
      messages.value.push({ role: 'assistant', content: '', cards: [card] });
    }
  } catch (err) {
    const msg = (err as Error).message || '';
    if (msg.includes('已处理') || msg.includes('重复') || msg.includes('已确认')) {
      // 该提案已被处理过（如重复点击）：移除卡片并轻提示，不再生成失败卡片
      resolvePendingCard(pendingId, null);
      ElMessage.info(msg || '该操作已处理完成');
    } else {
      const card: AiCard = {
        type: 'result',
        ok: false,
        title: '操作执行失败',
        rows: [{ label: '原因', value: msg || '未知错误' }],
      };
      if (!resolvePendingCard(pendingId, card)) {
        messages.value.push({ role: 'assistant', content: '', cards: [card] });
      }
    }
  } finally {
    thinking.value = false;
    // 不强制滚动：用户正在当前卡片位置操作，保持视口不动
  }
}

async function cancelAction(pendingId: number) {
  try {
    await agentApi.cancel(pendingId);
    // 就地替换为"已取消"，视口不动
    resolvePendingCard(pendingId, {
      type: 'result',
      ok: false,
      title: '已取消',
      rows: [{ label: '状态', value: '该操作已取消，未产生任何变更' }],
    });
  } catch {
    // 拦截器已提示
  }
}

async function clarifyAction(text: string) {
  messages.value.push({ role: 'user', content: text });
  await runChat(text);
}

function scrollToBottom() {
  nextTick(() => {
    const el = scrollRef.value;
    if (el) el.scrollTop = el.scrollHeight;
  });
}
</script>

<style scoped lang="scss">
.ai-fab-badge {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 2000;
}

.ai-fab {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: linear-gradient(135deg, #2456a6, #2c68c4);
  box-shadow: 0 4px 14px rgba(36, 86, 166, 0.4);
  transition: transform 0.15s ease;

  &:hover {
    transform: scale(1.06);
  }
}

.ai-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.ai-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid #e8edf4;
  flex-shrink: 0;

  .ai-header-title {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .ai-title {
    font-size: 15px;
    font-weight: 700;
    color: #2b3445;
  }

  .ai-conv-title {
    font-size: 12px;
    color: #7a8699;
    max-width: 130px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ai-header-actions {
    display: flex;
    gap: 4px;
  }
}

:deep(.history-menu) {
  max-height: 320px;
  overflow-y: auto;

  .history-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 2px 0;
  }

  .history-title {
    font-size: 13px;
    color: #2b3445;
    max-width: 280px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .history-time {
    font-size: 11px;
    color: #a3aec0;
  }
}

.ai-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* 配置表单 */
.ai-config {
  padding: 20px 16px;
  overflow-y: auto;

  .config-tip {
    font-size: 13px;
    color: #51607a;
    margin-bottom: 16px;
    padding: 8px 12px;
    background: #eef3fb;
    border-radius: 6px;
    border: 1px solid #dbe6f5;
  }

  .config-hint {
    font-size: 12px;
    color: #7a8699;
    line-height: 1.6;
    margin-bottom: 12px;
    padding: 6px 10px;
    background: #f7f9fc;
    border-radius: 6px;
  }

  .config-actions {
    display: flex;
    gap: 8px;
    margin-top: 4px;
  }
}

/* 空状态 */
.ai-empty {
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px;

  .empty-icon {
    color: #8aa9d2;
  }

  .empty-text {
    font-size: 13px;
    color: #7a8699;
    text-align: center;
    line-height: 1.6;
  }
}

/* 对话区 */
.ai-chat {
  .ai-messages {
    flex: 1;
    overflow-y: auto;
    padding: 14px 14px 8px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .chat-hint {
    text-align: center;
    padding: 32px 12px;

    .hint-title {
      font-size: 14px;
      font-weight: 600;
      color: #2b3445;
      margin-bottom: 10px;
    }

    .hint-items {
      display: inline-flex;
      flex-direction: column;
      gap: 6px;
      font-size: 12.5px;
      color: #7a8699;
      line-height: 1.6;
    }
  }

  .msg-row {
    display: flex;
    gap: 8px;

    &.user {
      justify-content: flex-end;

      .msg-bubble {
        background: var(--el-color-primary);
        color: #fff;
        border-radius: 10px 10px 2px 10px;
      }
    }

    &.assistant {
      .msg-bubble {
        background: #f2f5f9;
        color: #2b3445;
        border-radius: 10px 10px 10px 2px;
      }
    }

    .msg-avatar {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: linear-gradient(135deg, #2456a6, #2c68c4);
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      margin-top: 2px;
    }

    .msg-content {
      max-width: 82%;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .msg-bubble {
      padding: 8px 12px;
      font-size: 13px;
      line-height: 1.7;
      white-space: pre-wrap;
      word-break: break-word;

      &.thinking {
        color: #7a8699;
      }
    }
  }

  .report-card {
    border: 1px solid #f0d9b0;
    background: #fdf7ec;
    border-radius: 8px;
    padding: 10px 12px;

    .report-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 6px;

      .report-title {
        font-size: 13px;
        font-weight: 600;
        color: #8a5a17;
      }
    }

    .report-body {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .report-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      font-size: 12.5px;

      .report-label {
        color: #8a6d3b;
      }

      .report-value {
        color: #5b3d12;
      }
    }

    .report-empty {
      font-size: 12.5px;
      color: #8a6d3b;
    }
  }
}

.ai-input {
  border-top: 1px solid #e8edf4;
  padding: 10px 12px;
  flex-shrink: 0;

  .input-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 8px;

    .input-tip {
      font-size: 12px;
      color: #a3aec0;
    }
  }
}
</style>
