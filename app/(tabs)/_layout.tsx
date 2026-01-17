import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { Platform } from "react-native";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,

        tabBarShowLabel: true,
        tabBarActiveTintColor: "#D7E3FF",
        tabBarInactiveTintColor: "rgba(215,227,255,0.45)",

        tabBarStyle: {
          position: "absolute",
          left: 14,
          right: 14,
          bottom: 14,
          height: Platform.select({ ios: 78, android: 70 }),
          paddingBottom: Platform.select({ ios: 12, android: 10 }),
          paddingTop: 10,
          borderRadius: 22,

          backgroundColor: "rgba(10, 16, 32, 0.92)",
          borderTopWidth: 0,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.10)",

          shadowColor: "#000",
          shadowOpacity: 0.35,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 10 },
          elevation: 18,
        },

        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "700",
          marginTop: 2,
        },

        tabBarItemStyle: {
          borderRadius: 16,
          marginHorizontal: 6,
        },

        tabBarIconStyle: {
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons
              name={focused ? "home" : "home-outline"}
              size={size ?? 22}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="history"
        options={{
          title: "History",
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons
              name={focused ? "time" : "time-outline"}
              size={size ?? 22}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="intents"
        options={{
          title: "Intents",
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons
              name={focused ? "flash" : "flash-outline"}
              size={size ?? 22}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
