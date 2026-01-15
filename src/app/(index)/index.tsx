import { View, Text, Pressable, ScrollView, Platform } from "react-native";
import { useState, useEffect, useRef } from "react";
import { Audio } from "expo-audio";
import * as AC from "@bacons/apple-colors";
import Slider from "@react-native-community/slider";

type TimeSignature = { top: number; bottom: number };
type Subdivision = "whole" | "half" | "quarter" | "eighth" | "sixteenth";

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

const SUBDIVISIONS: Subdivision[] = ["whole", "half", "quarter", "eighth", "sixteenth"];

const getSubdivisionMultiplier = (subdivision: Subdivision): number => {
  switch (subdivision) {
    case "whole": return 1;
    case "half": return 2;
    case "quarter": return 4;
    case "eighth": return 8;
    case "sixteenth": return 16;
  }
};

export default function IndexRoute() {
  const [bpm, setBpm] = useState(120);
  const [timeSignature, setTimeSignature] = useState<TimeSignature>({ top: 4, bottom: 4 });
  const [subdivision, setSubdivision] = useState<Subdivision>("quarter");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(-1);
  const [accents, setAccents] = useState<Set<number>>(new Set([0]));

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

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
          playSound(accents.has(nextBeat));
          return nextBeat;
        });
      }, intervalMs);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [intervalMs, isPlaying, totalSubdivisions, accents]);

  const loadSounds = async () => {
    try {
      if (Platform.OS === 'web') {
        // @ts-ignore - Web Audio API
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      } else {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          shouldDuckAndroid: false,
          staysActiveInBackground: false,
        });
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

  const playWebSound = (frequency: number) => {
    if (!audioContextRef.current) {
      console.log('No audio context available');
      return;
    }

    const ctx = audioContextRef.current;

    // Resume context if suspended (required by some browsers)
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

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
  };

  const playSound = async (isAccent: boolean) => {
    try {
      if (Platform.OS === 'web') {
        playWebSound(isAccent ? 1200 : 800);
      } else {
        const clickSound = require('../../assets/click.wav');
        const accentSound = require('../../assets/accent-click.wav');

        const { sound } = await Audio.Sound.createAsync(
          isAccent ? accentSound : clickSound,
          { shouldPlay: true }
        );

        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.didJustFinish) {
            sound.unloadAsync();
          }
        });
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
      // Initialize audio context on first user interaction (web)
      if (Platform.OS === 'web' && !audioContextRef.current) {
        // @ts-ignore - Web Audio API
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }

      setCurrentBeat(0);
      playSound(accents.has(0));
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

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1 }}
    >
      <View style={{ padding: 20, gap: 32, alignItems: "center" }}>
        <Text style={{
          fontSize: 32,
          fontWeight: "700",
          color: AC.label as any,
          marginTop: 20
        }}>
          Metronome
        </Text>

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
            color: AC.secondaryLabel as any,
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
            <Text style={{ fontSize: 14, color: AC.secondaryLabel as any }}>20</Text>
            <Text style={{ fontSize: 14, color: AC.secondaryLabel as any }}>300</Text>
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
            color: AC.label as any
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
                    : AC.label as any
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
            color: AC.label as any
          }}>
            Subdivision
          </Text>
          <View style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8
          }}>
            {SUBDIVISIONS.map((sub) => (
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
                  fontSize: 16,
                  fontWeight: "600",
                  color: sub === subdivision ? "white" : AC.label as any
                }}>
                  {sub.charAt(0).toUpperCase() + sub.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Visual Beat Indicators */}
        <View style={{ gap: 12, width: "100%" }}>
          <Text style={{
            fontSize: 18,
            fontWeight: "600",
            color: AC.label as any
          }}>
            Beats (Tap to Accent)
          </Text>
          <View style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
            justifyContent: "center"
          }}>
            {Array.from({ length: totalSubdivisions }, (_, i) => (
              <Pressable
                key={i}
                onPress={() => toggleAccent(i)}
                style={({ pressed }) => {
                  const isActive = currentBeat === i;
                  const isAccented = accents.has(i);

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
                  color: currentBeat === i ? "white" : AC.label as any
                }}>
                  {i + 1}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={{
            fontSize: 14,
            color: AC.secondaryLabel as any,
            textAlign: "center",
            marginTop: 8
          }}>
            Orange border = Accented beat
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}
