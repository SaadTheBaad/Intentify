import AsyncStorage from "@react-native-async-storage/async-storage";

export type HistoryItem = {
  id: string;
  createdAt: string;
  audioUri: string;
  intentId: string;
  intentLabel: string;
};

const KEY = "intentify_history_v1";

export async function getHistory(): Promise<HistoryItem[]> {
  const raw = await AsyncStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as HistoryItem[]) : [];
}

export async function saveHistoryItem(item: HistoryItem) {
  const existing = await getHistory();
  const next = [item, ...existing];
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
}

export async function clearHistory() {
  await AsyncStorage.removeItem(KEY);
}