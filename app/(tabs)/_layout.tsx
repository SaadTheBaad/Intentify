import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { Tabs } from "expo-router";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Enable LayoutAnimation on Android
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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
          paddingBottom: Math.max(insets.bottom, 12),
        },
      ]}
    >
      <BlurView intensity={40} tint="dark" style={styles.blur}>
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
                // 1. Trigger Haptics for physical feel
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

                // 2. Animate layout changes (expansion/collapse)
                LayoutAnimation.configureNext(
                  LayoutAnimation.Presets.easeInEaseOut,
                );

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
  // We only animate opacity/scale here. Width is handled by LayoutAnimation in the parent.
  const animValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animValue, {
      toValue: focused ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [focused, animValue]);

  const activeColor = "#EAF0FF";
  const inactiveColor = "rgba(215,227,255,0.5)";

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.itemPressable,
        focused ? styles.itemPressableActive : styles.itemPressableInactive,
      ]}
    >
      <View style={[styles.item, focused && styles.itemActive]}>
        {/* Icon */}
        <Ionicons
          name={iconName}
          size={20}
          color={focused ? activeColor : inactiveColor}
        />

        {/* Label - Only rendered if focused to allow LayoutAnimation to collapse the width */}
        {focused && (
          <Animated.View style={{ opacity: animValue, marginLeft: 6 }}>
            <Text
              style={[styles.label, { color: activeColor }]}
              numberOfLines={1}
            >
              {label}
            </Text>
          </Animated.View>
        )}
      </View>
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
    left: 20,
    right: 20,
    bottom: 0,
    alignItems: "center", // Center the blur view horizontally
  },
  blur: {
    borderRadius: 30,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)", // Slightly more visible border
    backgroundColor: "rgba(10,16,32,0.6)", // Darker glass
    width: "100%",
    // Enhanced shadows for depth
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 20,
  },
  inner: {
    flexDirection: "row",
    padding: 6,
    alignItems: "center",
    justifyContent: "space-between",
  },
  itemPressable: {
    justifyContent: "center",
    alignItems: "center",
    height: 50,
    borderRadius: 25,
  },
  // Dynamic widths for expansion effect
  itemPressableActive: {
    flex: 2, // Takes up more space
  },
  itemPressableInactive: {
    flex: 1, // Takes up less space
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    width: "100%",
    borderRadius: 24,
  },
  itemActive: {
    backgroundColor: "rgba(215,227,255,0.15)",
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
});
