import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
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

// Match the design language of your other screens
const COLORS = {
  bg: ["#0B1020", "#0E1731", "#0A0F1F"],
  text: "#EAF0FF",
  textDim: "rgba(234,240,255,0.5)",
  accent: "#8FD0FF", // Sky blue accent
  danger: "#FFD1D1",
  glassFill: "rgba(255,255,255,0.04)",
  glassBorder: "rgba(255,255,255,0.08)",
};

export default function IntentsScreen() {
  const insets = useSafeAreaInsets();
  const [deviceId, setDeviceId] = useState<string>("");
  const [items, setItems] = useState<IntentItem[]>([]);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const canAdd = useMemo(
    () => label.trim().length > 0 && deviceId.length > 0 && !isAdding,
    [label, deviceId, isAdding],
  );

  const load = async () => {
    try {
      setError(null);
      const did = await getOrCreateDeviceId();
      setDeviceId(did);
      const res = await listIntents(did);
      setItems(res.items || []);
    } catch (e: any) {
      setError("Failed to sync intents");
    }
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, []),
  );

  const onAdd = async () => {
    if (!canAdd) return;
    try {
      setIsAdding(true);
      setError(null);
      const id = makeIntentId(label);
      await createIntent(deviceId, id, label.trim());
      setLabel("");
      await load();
    } catch (e: any) {
      Alert.alert("Add failed", "Could not save your intent.");
    } finally {
      setIsAdding(false);
    }
  };

  const onDelete = async (intentId: string) => {
    try {
      setError(null);
      await deleteIntent(deviceId, intentId);
      await load();
    } catch (e: any) {
      Alert.alert("Delete failed", "Could not remove this intent.");
    }
  };

  return (
    <LinearGradient colors={COLORS.bg as any} style={styles.container}>
      {/* Background Atmosphere */}
      <View style={styles.atmosphere}>
        <View style={styles.meshA} />
        <View style={styles.meshB} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <FlatList
          data={items}
          keyExtractor={(i) => i.intentId}
          contentContainerStyle={[
            styles.listContent,
            { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 120 },
          ]}
          ListHeaderComponent={
            <View style={styles.header}>
              <View>
                <Text style={styles.title}>Intents</Text>
                <Text style={styles.subtitle}>
                  Phrases used to help the AI understand you faster.
                </Text>
              </View>

              <View style={styles.addCard}>
                <View style={styles.inputWrap}>
                  <Ionicons name="sparkles" size={16} color={COLORS.accent} />
                  <TextInput
                    value={label}
                    onChangeText={setLabel}
                    placeholder="E.g. I need a glass of water"
                    placeholderTextColor="rgba(234,240,255,0.25)"
                    style={styles.input}
                    returnKeyType="done"
                    onSubmitEditing={onAdd}
                  />
                </View>

                <Pressable
                  onPress={onAdd}
                  disabled={!canAdd}
                  style={({ pressed }) => [
                    styles.addBtn,
                    !canAdd && styles.addBtnDisabled,
                    pressed && canAdd && { opacity: 0.8 },
                  ]}
                >
                  <Ionicons
                    name={isAdding ? "ellipsis-horizontal" : "add"}
                    size={20}
                    color="#0B1020"
                  />
                  <Text style={styles.addBtnText}>
                    {isAdding ? "Saving" : "Add Intent"}
                  </Text>
                </Pressable>
              </View>

              <View style={styles.divider}>
                <Text style={styles.dividerText}>YOUR SAVED PHRASES</Text>
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons
                name="chatbubbles-outline"
                size={32}
                color={COLORS.textDim}
              />
              <Text style={styles.emptyTitle}>No saved intents</Text>
              <Text style={styles.emptyText}>
                Phrases you add here will appear as shortcuts.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <View style={styles.rowIcon}>
                  <Ionicons
                    name="chatbubble-outline"
                    size={16}
                    color={COLORS.accent}
                  />
                </View>
                <Text style={styles.rowLabel} numberOfLines={2}>
                  {item.label}
                </Text>
              </View>

              <Pressable
                onPress={() => onDelete(item.intentId)}
                style={({ pressed }) => [
                  styles.deleteBtn,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Ionicons
                  name="trash-outline"
                  size={18}
                  color={COLORS.danger}
                />
              </Pressable>
            </View>
          )}
        />
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  atmosphere: { ...StyleSheet.absoluteFillObject, overflow: "hidden" },
  meshA: {
    position: "absolute",
    top: -50,
    right: -50,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: "rgba(143,208,255,0.05)",
  },
  meshB: {
    position: "absolute",
    bottom: 100,
    left: -80,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: "rgba(128,152,255,0.03)",
  },
  listContent: { paddingHorizontal: 20 },
  header: { marginBottom: 20 },
  title: {
    fontSize: 32,
    fontWeight: "900",
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textDim,
    marginTop: 4,
    lineHeight: 20,
  },

  addCard: {
    marginTop: 24,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    gap: 12,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    height: 52,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.2)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  input: {
    flex: 1,
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "600",
  },
  addBtn: {
    flexDirection: "row",
    height: 52,
    borderRadius: 16,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  addBtnDisabled: {
    backgroundColor: "rgba(143,208,255,0.2)",
    opacity: 0.5,
  },
  addBtnText: { color: "#0B1020", fontWeight: "800", fontSize: 15 },

  divider: { marginTop: 32, marginBottom: 12, paddingLeft: 4 },
  dividerText: {
    color: COLORS.textDim,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
  },

  row: {
    backgroundColor: COLORS.glassFill,
    borderRadius: 20,
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  rowLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 14 },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(143,208,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { flex: 1, color: COLORS.text, fontSize: 15, fontWeight: "700" },
  deleteBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,92,92,0.05)",
  },

  empty: {
    marginTop: 40,
    alignItems: "center",
    gap: 12,
    padding: 40,
  },
  emptyTitle: { color: COLORS.text, fontWeight: "800", fontSize: 18 },
  emptyText: {
    color: COLORS.textDim,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
});
