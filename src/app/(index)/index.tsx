import { View, Text, Pressable, ScrollView, Platform } from "react-native";
import { useState, useEffect, useRef } from "react";
import { useAudioPlayer } from "expo-audio";
import * as AC from "@bacons/apple-colors";
import Slider from "@react-native-community/slider";

type TimeSignature = { top: number; bottom: number };
type Subdivision = "whole" | "half" | "quarter" | "eighth" | "sixteenth" | "eighth-sixteenth-sixteenth" | "sixteenth-sixteenth-eighth";

const TIME_SIGNATURES: TimeSignature[] = [
  { top: 2, bottom: 4 },
  { top: 3, bottom: 4 },
  { top: 4, bottom: 4 },
  { top: 5, bottom: 4 },
  { top: 6, bottom: 8 },
  { top: 7, bottom: 8 },
  { top: 9, bottom: 8 },
  { top: 12, bottom: 8 },
];

const SUBDIVISIONS: Subdivision[] = [
  "whole",
  "half",
  "quarter",
  "eighth",
  "sixteenth",
  "eighth-sixteenth-sixteenth",
  "sixteenth-sixteenth-eighth"
];

const getSubdivisionMultiplier = (subdivision: Subdivision): number => {
  switch (subdivision) {
    case "whole": return 1;
    case "half": return 2;
    case "quarter": return 4;
    case "eighth": return 8;
    case "sixteenth": return 16;
    case "eighth-sixteenth-sixteenth": return 16;
    case "sixteenth-sixteenth-eighth": return 16;
  }
};

const getSubdivisionPattern = (subdivision: Subdivision, beatIndex: number, totalBeats: number): boolean => {
  // Returns true if this beat should be played based on the subdivision pattern
  if (subdivision === "eighth-sixteenth-sixteenth") {
    // Pattern: eighth (2 sixteenths), sixteenth, sixteenth per quarter note
    // Within each group of 4 sixteenths: play beats 0, 2, 3
    const posInGroup = beatIndex % 4;
    return posInGroup === 0 || posInGroup === 2 || posInGroup === 3;
  } else if (subdivision === "sixteenth-sixteenth-eighth") {
    // Pattern: sixteenth, sixteenth, eighth (2 sixteenths) per quarter note
    // Within each group of 4 sixteenths: play beats 0, 1, 2
    const posInGroup = beatIndex % 4;
    return posInGroup === 0 || posInGroup === 1 || posInGroup === 2;
  }
  // For regular subdivisions, play all beats
  return true;
};

export default function IndexRoute() {
  const [bpm, setBpm] = useState(120);
  const [timeSignature, setTimeSignature] = useState<TimeSignature>({ top: 4, bottom: 4 });
  const [subdivision, setSubdivision] = useState<Subdivision>("quarter");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(-1);
  const [accents, setAccents] = useState<Set<number>>(new Set([0]));
  const [isDarkMode, setIsDarkMode] = useState(true);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Audio players for native platforms
  const clickPlayer = Platform.OS !== 'web' ? useAudioPlayer(require('../../assets/click.wav')) : null;
  const accentPlayer = Platform.OS !== 'web' ? useAudioPlayer(require('../../assets/accent-click.wav')) : null;

  const beatsPerMeasure = timeSignature.top;
  const subdivisionMultiplier = getSubdivisionMultiplier(subdivision);
  const totalSubdivisions = beatsPerMeasure * (subdivisionMultiplier / timeSignature.bottom);
  const intervalMs = 60000 / bpm / (subdivisionMultiplier / timeSignature.bottom);

  useEffect(() => {
    loadSounds();
    return () => {
      unloadSounds();
    };
  }, []);

  useEffect(() => {
    if (isPlaying) {
      // Restart interval with new timing when BPM changes
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }

      intervalRef.current = setInterval(() => {
        setCurrentBeat((prevBeat) => {
          const nextBeat = (prevBeat + 1) % totalSubdivisions;
          // Only play sound if this beat is part of the subdivision pattern
          if (getSubdivisionPattern(subdivision, nextBeat, totalSubdivisions)) {
            playSound(accents.has(nextBeat));
          }
          return nextBeat;
        });
      }, intervalMs);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [intervalMs, isPlaying, totalSubdivisions, subdivision, accents]);

  const loadSounds = async () => {
    try {
      if (Platform.OS === 'web') {
        // @ts-ignore - Web Audio API
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
    } catch (error) {
      console.error("Error setting audio mode:", error);
    }
  };

  const unloadSounds = async () => {
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
  };

  const playSound = async (isAccent: boolean) => {
    try {
      if (Platform.OS === 'web') {
        // Web Audio API for web platform
        if (!audioContextRef.current) {
          console.log('No audio context available');
          return;
        }

        const ctx = audioContextRef.current;

        // Resume context if suspended (required by some browsers)
        if (ctx.state === 'suspended') {
          ctx.resume();
        }

        const frequency = isAccent ? 1200 : 800;
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.frequency.value = frequency;
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);

        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.05);
      } else {
        // Use expo-audio players for native platforms
        const player = isAccent ? accentPlayer : clickPlayer;
        if (player) {
          player.seekTo(0);
          player.play();
        }
      }
    } catch (error) {
      console.error("Error playing sound:", error);
    }
  };

  const togglePlay = () => {
    if (isPlaying) {
      setCurrentBeat(-1);
      setIsPlaying(false);
    } else {
      // Initialize audio context on first user interaction (web only)
      if (Platform.OS === 'web' && !audioContextRef.current) {
        // @ts-ignore - Web Audio API
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }

      setCurrentBeat(0);
      // Only play sound if this beat is part of the subdivision pattern
      if (getSubdivisionPattern(subdivision, 0, totalSubdivisions)) {
        playSound(accents.has(0));
      }
      setIsPlaying(true);
    }
  };

  const toggleAccent = (beat: number) => {
    const newAccents = new Set(accents);
    if (newAccents.has(beat)) {
      newAccents.delete(beat);
    } else {
      newAccents.add(beat);
    }
    setAccents(newAccents);
  };

  const bgColor = isDarkMode ? "black" : "white";
  const textColor = isDarkMode ? "white" : "black";

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: bgColor }}
    >
      <View style={{ padding: 20, gap: 32, alignItems: "center", backgroundColor: bgColor }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%", marginTop: 20 }}>
          <View style={{ width: 60 }} />
          <Text style={{
            fontSize: 32,
            fontWeight: "700",
            color: textColor
          }}>
            Metronome
          </Text>
          <Pressable
            onPress={() => setIsDarkMode(!isDarkMode)}
            style={({ pressed }) => ({
              width: 60,
              height: 32,
              borderRadius: 16,
              backgroundColor: pressed ? AC.systemGray4 as any : AC.systemGray5 as any,
              justifyContent: "center",
              alignItems: "center",
            })}
          >
            <Text style={{ fontSize: 18 }}>
              {isDarkMode ? "☀️" : "🌙"}
            </Text>
          </Pressable>
        </View>

        {/* BPM Control */}
        <View style={{ alignItems: "center", gap: 16, width: "100%", paddingHorizontal: 20 }}>
          <Text style={{
            fontSize: 72,
            fontWeight: "700",
            color: AC.systemBlue as any
          }}>
            {bpm}
          </Text>
          <Text style={{
            fontSize: 16,
            color: isDarkMode ? AC.secondaryLabel as any : AC.systemGray as any,
            fontWeight: "600"
          }}>
            BPM
          </Text>

          <Slider
            style={{ width: "100%", height: 40 }}
            minimumValue={20}
            maximumValue={300}
            step={1}
            value={bpm}
            onValueChange={setBpm}
            minimumTrackTintColor={AC.systemBlue as any}
            maximumTrackTintColor={AC.systemGray5 as any}
            thumbTintColor={AC.systemBlue as any}
          />

          <View style={{ flexDirection: "row", justifyContent: "space-between", width: "100%" }}>
            <Text style={{ fontSize: 14, color: isDarkMode ? AC.secondaryLabel as any : AC.systemGray as any }}>20</Text>
            <Text style={{ fontSize: 14, color: isDarkMode ? AC.secondaryLabel as any : AC.systemGray as any }}>300</Text>
          </View>
        </View>

        {/* Visual Beat Indicators */}
        <View style={{ gap: 12, width: "100%" }}>
          <Text style={{
            fontSize: 18,
            fontWeight: "600",
            color: textColor
          }}>
            Beats (Tap to Accent)
          </Text>
          <View style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
            justifyContent: "center"
          }}>
            {Array.from({ length: beatsPerMeasure }, (_, i) => {
              const subdivisionsPerBeat = subdivisionMultiplier / timeSignature.bottom;
              const isActive = Math.floor(currentBeat / subdivisionsPerBeat) === i && currentBeat >= 0;
              const beatStartIndex = i * subdivisionsPerBeat;

              // Check if any subdivision in this beat is accented
              const isAccented = Array.from({ length: subdivisionsPerBeat }, (_, j) =>
                accents.has(beatStartIndex + j)
              ).some(Boolean);

              return (
                <Pressable
                  key={i}
                  onPress={() => {
                    // Toggle accent on the first subdivision of this beat
                    toggleAccent(beatStartIndex);
                  }}
                  style={({ pressed }) => {
                    return {
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      backgroundColor:
                        isActive && isAccented
                          ? AC.systemRed as any
                          : isActive
                            ? AC.systemBlue as any
                            : isAccented
                              ? AC.systemOrange as any
                              : pressed
                                ? AC.systemGray5 as any
                                : AC.systemGray6 as any,
                      justifyContent: "center",
                      alignItems: "center",
                      borderWidth: isAccented ? 3 : 0,
                      borderColor: AC.systemOrange as any,
                    };
                  }}
                >
                  <Text style={{
                    fontSize: 14,
                    fontWeight: "700",
                    color: isActive ? "white" : textColor
                  }}>
                    {i + 1}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            marginTop: 8
          }}>
            <View style={{
              width: 20,
              height: 20,
              borderRadius: 10,
              backgroundColor: AC.systemOrange as any,
              borderWidth: 3,
              borderColor: AC.systemOrange as any,
            }} />
            <Text style={{
              fontSize: 14,
              color: isDarkMode ? AC.secondaryLabel as any : AC.systemGray as any,
            }}>
              = Accented beat
            </Text>
          </View>
        </View>

        {/* Play/Pause Button */}
        <Pressable
          onPress={togglePlay}
          style={({ pressed }) => ({
            backgroundColor: pressed ? AC.systemBlue as any : AC.systemBlue as any,
            paddingHorizontal: 48,
            paddingVertical: 20,
            borderRadius: 16,
            borderCurve: "continuous",
            minWidth: 200,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text style={{
            fontSize: 24,
            fontWeight: "700",
            color: "white",
            textAlign: "center"
          }}>
            {isPlaying ? "Stop" : "Start"}
          </Text>
        </Pressable>

        {/* Time Signature */}
        <View style={{ gap: 12, width: "100%" }}>
          <Text style={{
            fontSize: 18,
            fontWeight: "600",
            color: textColor
          }}>
            Time Signature
          </Text>
          <View style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8
          }}>
            {TIME_SIGNATURES.map((sig) => (
              <Pressable
                key={`${sig.top}/${sig.bottom}`}
                onPress={() => {
                  setTimeSignature(sig);
                  setAccents(new Set([0]));
                  setCurrentBeat(-1);
                }}
                style={({ pressed }) => ({
                  backgroundColor:
                    sig.top === timeSignature.top && sig.bottom === timeSignature.bottom
                      ? AC.systemBlue as any
                      : pressed
                        ? AC.systemGray5 as any
                        : AC.systemGray6 as any,
                  paddingHorizontal: 20,
                  paddingVertical: 12,
                  borderRadius: 10,
                  borderCurve: "continuous",
                })}
              >
                <Text style={{
                  fontSize: 16,
                  fontWeight: "600",
                  color: sig.top === timeSignature.top && sig.bottom === timeSignature.bottom
                    ? "white"
                    : textColor
                }}>
                  {sig.top}/{sig.bottom}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Subdivision */}
        <View style={{ gap: 12, width: "100%" }}>
          <Text style={{
            fontSize: 18,
            fontWeight: "600",
            color: textColor
          }}>
            Subdivision
          </Text>
          <View style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8
          }}>
            {SUBDIVISIONS.map((sub) => {
              const notationMap: Record<Subdivision, string> = {
                whole: "1/1",
                half: "1/2",
                quarter: "1/4",
                eighth: "1/8",
                sixteenth: "1/16",
                "eighth-sixteenth-sixteenth": "1/8 - 1/16 - 1/16",
                "sixteenth-sixteenth-eighth": "1/16 - 1/16 - 1/8"
              };

              return (
                <Pressable
                  key={sub}
                  onPress={() => {
                    setSubdivision(sub);
                    setAccents(new Set([0]));
                    setCurrentBeat(-1);
                  }}
                  style={({ pressed }) => ({
                    backgroundColor:
                      sub === subdivision
                        ? AC.systemBlue as any
                        : pressed
                          ? AC.systemGray5 as any
                          : AC.systemGray6 as any,
                    paddingHorizontal: 20,
                    paddingVertical: 12,
                    borderRadius: 10,
                    borderCurve: "continuous",
                  })}
                >
                  <Text style={{
                    fontSize: 18,
                    fontWeight: "600",
                    color: sub === subdivision ? "white" : textColor
                  }}>
                    {notationMap[sub]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
