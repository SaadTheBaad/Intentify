import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function iconFor(routeName: string, focused: boolean) {
  switch (routeName) {
    case "index":
      return focused ? "home" : "home-outline";
    case "history":
      return focused ? "time" : "time-outline";
    case "intents":
      return focused ? "flash" : "flash-outline";
    default:
      return focused ? "ellipse" : "ellipse-outline";
  }
}

function PremiumTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.wrapper,
        {
          paddingBottom: Math.max(insets.bottom, 10),
        },
      ]}
    >
      <BlurView intensity={28} tint="dark" style={styles.blur}>
        <View style={styles.inner}>
          {state.routes.map((route, index) => {
            const { options } = descriptors[route.key];
            const label =
              options.tabBarLabel !== undefined
                ? (options.tabBarLabel as string)
                : options.title !== undefined
                ? options.title
                : route.name;

            const isFocused = state.index === index;

            const onPress = () => {
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });

              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            };

            return (
              <TabItem
                key={route.key}
                label={label}
                iconName={iconFor(route.name, isFocused)}
                focused={isFocused}
                onPress={onPress}
              />
            );
          })}
        </View>
      </BlurView>
    </View>
  );
}

function TabItem({
  label,
  iconName,
  focused,
  onPress,
}: {
  label: string;
  iconName: any;
  focused: boolean;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: focused ? 1.06 : 1,
        useNativeDriver: true,
        speed: 14,
        bounciness: 8,
      }),
      Animated.timing(glow, {
        toValue: focused ? 1 : 0,
        duration: focused ? 180 : 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [focused, scale, glow]);

  const activeOpacity = glow.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const activeScale = glow.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1],
  });

  const iconColor = focused ? "#EAF0FF" : "rgba(215,227,255,0.50)";
  const textColor = focused ? "#D7E3FF" : "rgba(215,227,255,0.45)";

  return (
    <Pressable onPress={onPress} style={styles.itemPressable}>
      <Animated.View style={[styles.item, { transform: [{ scale }] }]}>
        {/* Active pill */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.activePill,
            {
              opacity: activeOpacity,
              transform: [{ scale: activeScale }],
            },
          ]}
        />

        {/* Label */}
        <View style={styles.labelRow}>
          <Ionicons name={iconName} size={18} color={iconColor} />
          <Text style={[styles.label, { color: textColor }]}>{label}</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <PremiumTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="history" options={{ title: "History" }} />
      <Tabs.Screen name="intents" options={{ title: "Intents" }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 12,
  },
  blur: {
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(10,16,32,0.55)",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 18,
  },
  inner: {
    flexDirection: "row",
    paddingHorizontal: 8,
    paddingTop: 10,
    paddingBottom: Platform.select({ ios: 10, android: 12 }),
    gap: 6,
    justifyContent: "space-between",
  },
  itemPressable: {
    flex: 1,
  },
  item: {
    height: 54,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    position: "relative",
  },
  activePill: {
    position: "absolute",
    left: 6,
    right: 6,
    top: 6,
    bottom: 6,
    borderRadius: 16,
    backgroundColor: "rgba(215,227,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(215,227,255,0.18)",
  },
  iconWrap: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
});
