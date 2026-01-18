import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  createIntent,
  deleteIntent,
  IntentItem,
  listIntents,
} from "../../src/services/apiService";
import { getOrCreateDeviceId } from "../../src/services/storageService";
import { makeIntentId } from "../../src/utils/intent";

export default function IntentsScreen() {
  const insets = useSafeAreaInsets();

  const [deviceId, setDeviceId] = useState<string>("");
  const [items, setItems] = useState<IntentItem[]>([]);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  const canAdd = useMemo(
    () => label.trim().length > 0 && deviceId.length > 0,
    [label, deviceId]
  );

  const load = async () => {
    try {
      setError(null);
      const did = await getOrCreateDeviceId();
      setDeviceId(did);

      const res = await listIntents(did);
      setItems(res.items || []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load intents");
    }
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  const onAdd = async () => {
    if (!canAdd) return;
    try {
      setError(null);
      const id = makeIntentId(label);
      await createIntent(deviceId, id, label.trim());
      setLabel("");
      await load();
    } catch (e: any) {
      Alert.alert("Add failed", e?.message ?? "Unknown error");
    }
  };

  const onDelete = async (intentId: string) => {
    try {
      setError(null);
      await deleteIntent(deviceId, intentId);
      await load();
    } catch (e: any) {
      Alert.alert("Delete failed", e?.message ?? "Unknown error");
    }
  };

  return (
    <LinearGradient
      colors={["#0B1020", "#0E1731", "#0A0F1F"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.container,
        {
          paddingTop: insets.top + 14,
          paddingBottom: Math.max(insets.bottom, 18) + 110, // above floating tab bar
        },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.appIcon}>
            <Ionicons name="flash" size={18} color="#D7E3FF" />
          </View>
          <View>
            <Text style={styles.title}>Intents</Text>
            <Text style={styles.subtitle}>Approved phrases for suggestions</Text>
          </View>
        </View>
      </View>

      {/* Error */}
      {error ? (
        <View style={styles.errorBox}>
          <Ionicons name="warning" size={16} color="#FFD1D1" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* Add Card */}
      <View style={styles.addCard}>
        <View style={styles.inputWrap}>
          <Ionicons name="sparkles-outline" size={18} color="rgba(215,227,255,0.75)" />
          <TextInput
            value={label}
            onChangeText={setLabel}
            placeholder="Add an intent, e.g. “I need more time to respond”"
            placeholderTextColor="rgba(234,240,255,0.35)"
            style={styles.input}
          />
        </View>

        <Pressable
          onPress={onAdd}
          disabled={!canAdd}
          style={({ pressed }) => [
            styles.addBtn,
            !canAdd && styles.addBtnDisabled,
            pressed && canAdd && { opacity: 0.9 },
          ]}
        >
          <Ionicons name="add" size={18} color={canAdd ? "#0B1020" : "rgba(11,16,32,0.55)"} />
          <Text style={[styles.addBtnText, !canAdd && styles.addBtnTextDisabled]}>
            Add
          </Text>
        </Pressable>
      </View>

      {/* List */}
      <FlatList
        contentContainerStyle={{ paddingTop: 14, paddingBottom: 12 }}
        data={items}
        keyExtractor={(i) => i.intentId}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="flash-outline" size={22} color="rgba(215,227,255,0.55)" />
            <Text style={styles.emptyTitle}>No intents yet</Text>
            <Text style={styles.emptyText}>Add a few above to speed up confirmation.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={styles.rowIcon}>
                <Ionicons name="chatbubble-ellipses-outline" size={16} color="#D7E3FF" />
              </View>
              <Text style={styles.rowLabel} numberOfLines={2}>
                {item.label}
              </Text>
            </View>

            <Pressable
              onPress={() => onDelete(item.intentId)}
              style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.85 }]}
            >
              <Ionicons name="trash-outline" size={18} color="#FFD1D1" />
            </Pressable>
          </View>
        )}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 18 },

  header: {
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  appIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(215,227,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(215,227,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: "#EAF0FF", fontSize: 22, fontWeight: "900" },
  subtitle: { color: "rgba(234,240,255,0.60)", fontSize: 12, marginTop: 2 },

  errorBox: {
    marginTop: 10,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,92,92,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,92,92,0.22)",
  },
  errorText: { flex: 1, color: "#FFE9E9", fontSize: 12, fontWeight: "700" },

  addCard: {
    marginTop: 10,
    borderRadius: 22,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    gap: 12,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: "rgba(215,227,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(215,227,255,0.10)",
  },
  input: {
    flex: 1,
    color: "#EAF0FF",
    fontSize: 14,
    fontWeight: "600",
  },

  addBtn: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: "#D7E3FF", // light accent button
    borderWidth: 1,
    borderColor: "rgba(215,227,255,0.55)",
  },
  addBtnDisabled: {
    backgroundColor: "rgba(215,227,255,0.22)",
    borderColor: "rgba(215,227,255,0.25)",
  },
  addBtnText: { color: "#0B1020", fontWeight: "900", fontSize: 14 },
  addBtnTextDisabled: { color: "rgba(11,16,32,0.55)" },

  empty: {
    marginTop: 22,
    borderRadius: 22,
    padding: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: { color: "#EAF0FF", fontWeight: "900", fontSize: 16, marginTop: 4 },
  emptyText: { color: "rgba(234,240,255,0.65)", fontSize: 12, textAlign: "center" },

  row: {
    marginBottom: 12,
    borderRadius: 22,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  rowLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "rgba(215,227,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(215,227,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { flex: 1, color: "#EAF0FF", fontSize: 14, fontWeight: "800" },

  deleteBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,92,92,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,92,92,0.18)",
  },
});
