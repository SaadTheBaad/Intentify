import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useMemo, useState } from "react";
import {
    Alert,
    FlatList,
    Pressable,
    Text,
    TextInput,
    View,
} from "react-native";

import {
    createIntent,
    deleteIntent,
    IntentItem,
    listIntents,
} from "../../src/services/apiService";
import { getOrCreateDeviceId } from "../../src/services/storageService";

function makeId(label: string) {
  return (
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 50) || `intent-${Date.now()}`
  );
}

export default function IntentsScreen() {
  const [deviceId, setDeviceId] = useState<string>("");
  const [items, setItems] = useState<IntentItem[]>([]);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const canAdd = useMemo(
    () => label.trim().length > 0 && deviceId.length > 0,
    [label, deviceId],
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
    }, []),
  );

  const onAdd = async () => {
    if (!canAdd) return;
    try {
      setError(null);

      const id = makeId(label);
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
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: "700" }}>Intents</Text>
      <Text style={{ marginTop: 6, opacity: 0.7 }}>
        Your approved phrases (used as suggestions during confirmation).
      </Text>

      {error ? (
        <Text style={{ marginTop: 10, color: "red" }}>{error}</Text>
      ) : null}

      <View style={{ marginTop: 14, gap: 10 }}>
        <TextInput
          value={label}
          onChangeText={setLabel}
          placeholder="Add an intent, e.g. “I need more time to respond”"
          style={{ borderWidth: 1, borderRadius: 12, padding: 12 }}
        />
        <Pressable
          onPress={onAdd}
          disabled={!canAdd}
          style={{
            borderWidth: 1,
            borderRadius: 12,
            padding: 12,
            alignItems: "center",
            opacity: canAdd ? 1 : 0.4,
          }}
        >
          <Text style={{ fontWeight: "700" }}>Add</Text>
        </Pressable>
      </View>

      <FlatList
        style={{ marginTop: 14 }}
        data={items}
        keyExtractor={(i) => i.intentId}
        ListEmptyComponent={
          <Text style={{ marginTop: 20 }}>
            No intents yet. Add a few above.
          </Text>
        }
        renderItem={({ item }) => (
          <View
            style={{
              padding: 14,
              borderWidth: 1,
              borderRadius: 12,
              marginBottom: 10,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <Text style={{ flex: 1 }}>{item.label}</Text>
            <Pressable
              onPress={() => onDelete(item.intentId)}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderWidth: 1,
                borderRadius: 10,
              }}
            >
              <Text>Delete</Text>
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}
