import { View, Text, Pressable, ScrollView, useWindowDimensions } from "react-native";
import { useState, useEffect, useRef } from "react";
import { Audio } from "expo-audio";
import * as AC from "@bacons/apple-colors";

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

  const soundRef = useRef<Audio.Sound | null>(null);
  const accentSoundRef = useRef<Audio.Sound | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const { width } = useWindowDimensions();

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

  const loadSounds = async () => {
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
      });

      const { sound } = await Audio.Sound.createAsync(
        { uri: createClickSound(800) },
        { shouldPlay: false }
      );
      soundRef.current = sound;

      const { sound: accentSound } = await Audio.Sound.createAsync(
        { uri: createClickSound(1200) },
        { shouldPlay: false }
      );
      accentSoundRef.current = accentSound;
    } catch (error) {
      console.error("Error loading sounds:", error);
    }
  };

  const unloadSounds = async () => {
    if (soundRef.current) {
      await soundRef.current.unloadAsync();
    }
    if (accentSoundRef.current) {
      await accentSoundRef.current.unloadAsync();
    }
  };

  const createClickSound = (frequency: number) => {
    const sampleRate = 44100;
    const duration = 0.05;
    const numSamples = Math.floor(sampleRate * duration);
    const samples = new Float32Array(numSamples);

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const envelope = Math.exp(-10 * t);
      samples[i] = Math.sin(2 * Math.PI * frequency * t) * envelope;
    }

    const maxVal = Math.max(...samples.map(Math.abs));
    for (let i = 0; i < samples.length; i++) {
      samples[i] /= maxVal;
    }

    const wavData = createWavBlob(samples, sampleRate);
    return wavData;
  };

  const createWavBlob = (samples: Float32Array, sampleRate: number) => {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, samples.length * 2, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }

    const blob = new Blob([buffer], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  };

  const playSound = async (isAccent: boolean) => {
    try {
      const sound = isAccent ? accentSoundRef.current : soundRef.current;
      if (sound) {
        await sound.setPositionAsync(0);
        await sound.playAsync();
      }
    } catch (error) {
      console.error("Error playing sound:", error);
    }
  };

  const togglePlay = () => {
    if (isPlaying) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setCurrentBeat(-1);
      setIsPlaying(false);
    } else {
      setCurrentBeat(0);
      playSound(accents.has(0));

      let beat = 0;
      intervalRef.current = setInterval(() => {
        beat = (beat + 1) % totalSubdivisions;
        setCurrentBeat(beat);
        playSound(accents.has(beat));
      }, intervalMs);

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

  const adjustBpm = (delta: number) => {
    setBpm(prev => Math.max(20, Math.min(300, prev + delta)));
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
        <View style={{ alignItems: "center", gap: 16, width: "100%" }}>
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

          <View style={{ flexDirection: "row", gap: 12 }}>
            <Pressable
              onPress={() => adjustBpm(-10)}
              style={({ pressed }) => ({
                backgroundColor: pressed ? AC.systemGray5 as any : AC.systemGray6 as any,
                paddingHorizontal: 24,
                paddingVertical: 12,
                borderRadius: 12,
                borderCurve: "continuous",
              })}
            >
              <Text style={{ fontSize: 20, fontWeight: "600", color: AC.label as any }}>-10</Text>
            </Pressable>

            <Pressable
              onPress={() => adjustBpm(-1)}
              style={({ pressed }) => ({
                backgroundColor: pressed ? AC.systemGray5 as any : AC.systemGray6 as any,
                paddingHorizontal: 24,
                paddingVertical: 12,
                borderRadius: 12,
                borderCurve: "continuous",
              })}
            >
              <Text style={{ fontSize: 20, fontWeight: "600", color: AC.label as any }}>-1</Text>
            </Pressable>

            <Pressable
              onPress={() => adjustBpm(1)}
              style={({ pressed }) => ({
                backgroundColor: pressed ? AC.systemGray5 as any : AC.systemGray6 as any,
                paddingHorizontal: 24,
                paddingVertical: 12,
                borderRadius: 12,
                borderCurve: "continuous",
              })}
            >
              <Text style={{ fontSize: 20, fontWeight: "600", color: AC.label as any }}>+1</Text>
            </Pressable>

            <Pressable
              onPress={() => adjustBpm(10)}
              style={({ pressed }) => ({
                backgroundColor: pressed ? AC.systemGray5 as any : AC.systemGray6 as any,
                paddingHorizontal: 24,
                paddingVertical: 12,
                borderRadius: 12,
                borderCurve: "continuous",
              })}
            >
              <Text style={{ fontSize: 20, fontWeight: "600", color: AC.label as any }}>+10</Text>
            </Pressable>
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
