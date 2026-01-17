import AsyncStorage from "@react-native-async-storage/async-storage";
import { randomUUID } from "../utils/uuid";

export type HistoryItem = {
  id: string;
  createdAt: string;
  audioUri: string;
  intentId: string;
  intentLabel: string;
  s3Key?: string;
};

const HISTORY_KEY = "intentify_history_v1";
const DEVICE_ID_KEY = "intentify_device_id_v1";

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;

  const id = randomUUID();
  await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

export async function getHistory(): Promise<HistoryItem[]> {
  const raw = await AsyncStorage.getItem(HISTORY_KEY);
  return raw ? (JSON.parse(raw) as HistoryItem[]) : [];
}

export async function saveHistoryItem(item: HistoryItem) {
  const existing = await getHistory();
  const next = [item, ...existing];
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
}

export async function clearHistory() {
  await AsyncStorage.removeItem(HISTORY_KEY);
}
