import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { Tabs } from "expo-router";
import { useEffect, useState } from "react";
import {
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../src/context/ThemeContext";

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
  const { colors, isDark } = useTheme();
  const [containerWidth, setContainerWidth] = useState(0);
  const translateX = useSharedValue(0);

  const numTabs = state.routes.length;
  const tabWidth = containerWidth / numTabs;

  useEffect(() => {
    if (containerWidth > 0) {
      translateX.value = withSpring(state.index * tabWidth, {
        damping: 30, // Increased damping to reduce bounce
        stiffness: 120, // Slightly reduced stiffness for smoother arrival
      });
    }
  }, [state.index, tabWidth, containerWidth]);

  const animatedStyle = useAnimatedStyle(() => {
    const barWidth = tabWidth * 0.45; // Significantly shorter bar
    const centeringOffset = (tabWidth - barWidth) / 2;
    return {
      transform: [{ translateX: translateX.value + centeringOffset }],
      width: barWidth,
    };
  });

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
      <BlurView intensity={28} tint={isDark ? "dark" : "light"} style={[styles.blur, { backgroundColor: isDark ? "rgba(10,16,32,0.55)" : "rgba(255,255,255,0.75)", borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)" }]}>
        <View
          style={styles.inner}
          onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width - 16)}
        >
          {/* Animated Background Pill */}
          {containerWidth > 0 && (
            <Animated.View style={[styles.activePill, animatedStyle, { backgroundColor: isDark ? "rgba(215,227,255,0.30)" : "rgba(45,91,216,0.20)", borderColor: isDark ? "rgba(215,227,255,0.60)" : "rgba(45,91,216,0.40)" }]} />
          )}

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
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
  const { colors, isDark } = useTheme();
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withSpring(focused ? 1.06 : 1, {
      damping: 15,
      stiffness: 150,
    });
  }, [focused]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  const iconColor = focused ? (isDark ? "#EAF0FF" : "#2D5BD8") : (isDark ? "rgba(215,227,255,0.50)" : "rgba(0,0,0,0.40)");
  const textColor = focused ? (isDark ? "#D7E3FF" : "#2D5BD8") : (isDark ? "rgba(215,227,255,0.45)" : "rgba(0,0,0,0.35)");

  return (
    <Pressable onPress={onPress} style={styles.itemPressable}>
      <Animated.View style={[styles.item, animatedStyle]}>
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
    left: 0,
    top: 6, // Slightly larger to cover more area
    bottom: Platform.select({ ios: 6, android: 8 }),
    borderRadius: 0, // Completely square as requested
    backgroundColor: "rgba(215,227,255,0.30)", // Even more opaque for visibility
    borderWidth: 2, // Thicker border
    borderColor: "rgba(215,227,255,0.60)", // Brighter border
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
