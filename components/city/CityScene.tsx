"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { CITY } from "@/lib/constants";

export type CityIncident = {
  id: string;
  title: string;
  lat: number;
  lng: number;
  severity: string;
  status: string;
  category: string;
  neighborhood: string | null;
  address: string | null;
};

export type Quality = "high" | "balanced" | "low";

const PLATE = 240;
const UNITS_PER_DEGREE = 2400;

export function projectToCity(lat: number, lng: number) {
  const x = (lng - CITY.center.lng) * UNITS_PER_DEGREE;
  const z = -(lat - CITY.center.lat) * UNITS_PER_DEGREE;
  const limit = PLATE / 2 - 14;
  return {
    x: Math.max(-limit, Math.min(limit, x)),
    z: Math.max(-limit, Math.min(limit, z)),
  };
}

export function severityColor(severity: string, status: string) {
  if (status === "resolved") return "#43D6A0";
  if (severity === "critical") return "#F16D78";
  if (severity === "high") return "#F5B94B";
  if (severity === "medium") return "#36D9FF";
  return "#43D6A0";
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Building = { x: number; z: number; w: number; d: number; h: number; tint: number };
type Tree = { x: number; z: number; s: number };

type CityLayout = {
  buildings: Building[];
  trees: Tree[];
  roads: { x: number; z: number; horizontal: boolean; length: number }[];
  blocks: { x: number; z: number; size: number }[];
  parks: { x: number; z: number; size: number }[];
  intersections: { x: number; z: number }[];
  spacing: number;
};

function generateCity(quality: Quality): CityLayout {
  const rand = mulberry32(20261103);
  const grid = quality === "high" ? 7 : quality === "balanced" ? 5 : 4;
  const spacing = quality === "high" ? 30 : 36;
  const roadWidth = 7;
  const buildings: Building[] = [];
  const trees: Tree[] = [];
  const roads: CityLayout["roads"] = [];
  const blocks: CityLayout["blocks"] = [];
  const parks: CityLayout["parks"] = [];
  const intersections: CityLayout["intersections"] = [];

  const half = ((grid - 1) * spacing) / 2;
  const parkBlocks = new Set([1 + Math.floor(grid / 2), grid * (grid - 1) - 1]);

  for (let i = 0; i < grid; i++) {
    for (let j = 0; j < grid; j++) {
      const cx = -half + i * spacing;
      const cz = -half + j * spacing;
      blocks.push({ x: cx, z: cz, size: spacing - roadWidth });
      const isPark = parkBlocks.has(i * grid + j);

      if (isPark) {
        parks.push({ x: cx, z: cz, size: spacing - roadWidth - 4 });
        const treeCount = quality === "high" ? 9 : 4;
        for (let t = 0; t < treeCount; t++) {
          trees.push({
            x: cx + (rand() - 0.5) * (spacing - roadWidth - 8),
            z: cz + (rand() - 0.5) * (spacing - roadWidth - 8),
            s: 0.7 + rand() * 0.7,
          });
        }
        continue;
      }

      // Two to four lots per block, tallest near the block centre.
      const lots = quality === "high" ? (rand() > 0.25 ? 4 : 2) : rand() > 0.4 ? 2 : 1;
      const lotPositions =
        lots === 1
          ? [[0, 0]]
          : lots === 2
            ? [
                [-0.28, 0],
                [0.28, 0],
              ]
            : [
                [-0.27, -0.27],
                [0.27, -0.25],
                [-0.26, 0.27],
                [0.28, 0.26],
              ];

      for (const [ox, oz] of lotPositions) {
        const w = (spacing - roadWidth) * (lots === 1 ? 0.42 : 0.3) * (0.8 + rand() * 0.45);
        const d = (spacing - roadWidth) * (lots === 1 ? 0.42 : 0.3) * (0.8 + rand() * 0.45);
        const coreDistance = Math.hypot(cx, cz) / half;
        const base = 8 + rand() * 18;
        const h = base + (1 - Math.min(coreDistance, 1)) * 34 * (lots === 4 ? 1 : 0.7);
        buildings.push({
          x: cx + ox * (spacing - roadWidth),
          z: cz + oz * (spacing - roadWidth),
          w,
          d,
          h: Math.max(5, h),
          tint: rand(),
        });
      }
    }
  }

  for (let i = 0; i < grid; i++) {
    const pos = -half + i * spacing + spacing / 2;
    roads.push({ x: 0, z: pos - spacing / 2, horizontal: true, length: grid * spacing });
    roads.push({ x: pos - spacing / 2, z: 0, horizontal: false, length: grid * spacing });
  }
  for (let i = 0; i < grid; i++) {
    for (let j = 0; j < grid; j++) {
      intersections.push({
        x: -half + i * spacing + spacing / 2,
        z: -half + j * spacing + spacing / 2,
      });
    }
  }

  return { buildings, trees, roads, blocks, parks, intersections, spacing };
}

function useFacadeTexture() {
  return useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#0a1220";
    ctx.fillRect(0, 0, 128, 256);
    const cols = 6;
    const rows = 14;
    const cw = 128 / cols;
    const ch = 256 / rows;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const r = Math.random();
        const lit = r > 0.55;
        ctx.fillStyle = lit
          ? r > 0.9
            ? "rgba(120, 225, 255, 0.92)"
            : "rgba(245, 205, 150, 0.62)"
          : "rgba(18, 30, 48, 0.85)";
        ctx.fillRect(x * cw + 2, y * ch + 2.5, cw - 4.5, ch - 5.5);
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1.5, 1);
    tex.anisotropy = 4;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);
}

function Buildings({
  layout,
  quality,
  onHover,
  onSelect,
  selectedBlock,
}: {
  layout: CityLayout;
  quality: Quality;
  onHover: (b: { x: number; z: number } | null, screen?: { x: number; y: number }) => void;
  onSelect: (world: { x: number; z: number }) => void;
  selectedBlock: { x: number; z: number } | null;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const facade = useFacadeTexture();
  const [hovered, setHovered] = useState<number | null>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    layout.buildings.forEach((b, i) => {
      dummy.position.set(b.x, b.h / 2, b.z);
      dummy.scale.set(b.w, b.h, b.d);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      const shade = 0.5 + b.tint * 0.3;
      mesh.setColorAt(i, new THREE.Color().setHSL(0.58, 0.16, shade * 0.34));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [layout, dummy]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || !mesh.instanceColor) return;
    layout.buildings.forEach((b, i) => {
      const isSelected =
        !!selectedBlock &&
        Math.abs(b.x - selectedBlock.x) < layout.spacing / 2 &&
        Math.abs(b.z - selectedBlock.z) < layout.spacing / 2;
      const color =
        i === hovered
          ? new THREE.Color("#2a6d86")
          : isSelected
            ? new THREE.Color("#1d5b73")
            : new THREE.Color().setHSL(0.58, 0.16, (0.5 + b.tint * 0.3) * 0.34);
      mesh.setColorAt(i, color);
    });
    mesh.instanceColor.needsUpdate = true;
  }, [hovered, selectedBlock, layout]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, layout.buildings.length]}
      castShadow={quality === "high"}
      receiveShadow
      onPointerMove={(e) => {
        if (e.instanceId === undefined) return;
        const b = layout.buildings[e.instanceId];
        setHovered(e.instanceId);
        onHover({ x: b.x, z: b.z }, { x: e.clientX, y: e.clientY });
      }}
      onPointerOut={() => {
        setHovered(null);
        onHover(null);
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (e.instanceId === undefined) return;
        const b = layout.buildings[e.instanceId];
        onSelect({ x: b.x, z: b.z });
      }}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        map={facade}
        emissiveMap={facade}
        emissive="#ffffff"
        emissiveIntensity={0.55}
        roughness={0.62}
        metalness={0.35}
        toneMapped={false}
      />
    </instancedMesh>
  );
}

function BlockFloors({ layout }: { layout: CityLayout }) {
  return (
    <>
      {layout.blocks.map((b, i) => (
        <mesh
          key={i}
          position={[b.x, 0.35, b.z]}
          receiveShadow
        >
          <boxGeometry args={[b.size, 0.7, b.size]} />
          <meshStandardMaterial color="#16202f" roughness={0.95} />
        </mesh>
      ))}
      {layout.parks.map((p, i) => (
        <group key={`park-${i}`}>
          <mesh position={[p.x, 0.72, p.z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[p.size, p.size]} />
            <meshStandardMaterial color="#16342c" roughness={0.9} />
          </mesh>
          {layout.trees
            .filter((t) => Math.abs(t.x - p.x) < p.size / 2 && Math.abs(t.z - p.z) < p.size / 2)
            .map((t, j) => (
              <group key={j} position={[t.x, 0.72, t.z]}>
                <mesh position={[0, 0.5 * t.s, 0]} castShadow>
                  <cylinderGeometry args={[0.14 * t.s, 0.18 * t.s, 1 * t.s, 5]} />
                  <meshStandardMaterial color="#3c2f28" roughness={1} />
                </mesh>
                <mesh position={[0, 1.4 * t.s, 0]} castShadow>
                  <coneGeometry args={[0.85 * t.s, 2.2 * t.s, 7]} />
                  <meshStandardMaterial color="#2f7f63" roughness={0.85} />
                </mesh>
              </group>
            ))}
        </group>
      ))}
    </>
  );
}

function Roads({ layout, quality }: { layout: CityLayout; quality: Quality }) {
  const dashes = useMemo(() => {
    const out: { x: number; z: number; rot: number }[] = [];
    layout.roads.forEach((road) => {
      const steps = Math.floor(road.length / 8);
      for (let i = 0; i < steps; i++) {
        const offset = -road.length / 2 + i * 8 + 4;
        out.push(
          road.horizontal
            ? { x: offset, z: road.z, rot: 0 }
            : { x: road.x, z: offset, rot: Math.PI / 2 },
        );
      }
    });
    return out;
  }, [layout]);

  const dashRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    const mesh = dashRef.current;
    if (!mesh) return;
    dashes.forEach((d, i) => {
      dummy.position.set(d.x, 1.05, d.z);
      dummy.rotation.set(0, d.rot, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [dashes, dummy]);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
        <planeGeometry args={[PLATE + 40, PLATE + 40]} />
        <meshStandardMaterial color="#0a1220" roughness={0.98} />
      </mesh>

      {layout.roads.map((road, i) => (
        <mesh
          key={i}
          position={[road.x, 0.52, road.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
        >
          <planeGeometry
            args={road.horizontal ? [road.length + 14, 6.4] : [6.4, road.length + 14]}
          />
          <meshStandardMaterial color="#0f1a29" roughness={0.88} metalness={0.15} />
        </mesh>
      ))}

      {quality !== "low" && (
        <instancedMesh ref={dashRef} args={[undefined, undefined, dashes.length]}>
          <boxGeometry args={[3.2, 0.06, 0.22]} />
          <meshStandardMaterial color="#8fa3b8" emissive="#5d7185" emissiveIntensity={0.3} />
        </instancedMesh>
      )}

      {layout.intersections.map((p, i) => (
        <group key={`x-${i}`} position={[p.x, 0.56, p.z]}>
          {[0, 1, 2, 3].map((side) => (
            <group
              key={side}
              rotation={[0, (side * Math.PI) / 2, 0]}
              position={[
                side === 0 ? 0 : side === 2 ? 0 : side === 1 ? 4.6 : -4.6,
                0,
                side === 0 ? 4.6 : side === 2 ? -4.6 : 0,
              ]}
            >
              {[0, 1, 2, 3].map((stripe) => (
                <mesh
                  key={stripe}
                  position={[(stripe - 1.5) * 0.9, 0, 0]}
                  rotation={[-Math.PI / 2, 0, Math.PI / 2]}
                >
                  <planeGeometry args={[0.4, 4.2]} />
                  <meshStandardMaterial color="#c8d6e4" opacity={0.5} transparent />
                </mesh>
              ))}
            </group>
          ))}
        </group>
      ))}
    </group>
  );
}

function StreetLights({ layout }: { layout: CityLayout }) {
  const positions = useMemo(() => {
    const out: { x: number; z: number }[] = [];
    layout.blocks.forEach((b) => {
      const half = b.size / 2 - 1.4;
      out.push({ x: b.x - half, z: b.z + half }, { x: b.x + half, z: b.z - half });
    });
    return out;
  }, [layout]);

  const poles = useRef<THREE.InstancedMesh>(null);
  const heads = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    if (poles.current) {
      positions.forEach((p, i) => {
        dummy.position.set(p.x, 3.1, p.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        poles.current!.setMatrixAt(i, dummy.matrix);
      });
      poles.current.instanceMatrix.needsUpdate = true;
    }
    if (heads.current) {
      positions.forEach((p, i) => {
        dummy.position.set(p.x, 6.3, p.z);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        heads.current!.setMatrixAt(i, dummy.matrix);
      });
      heads.current.instanceMatrix.needsUpdate = true;
    }
  }, [positions, dummy]);

  return (
    <group>
      <instancedMesh ref={poles} args={[undefined, undefined, positions.length]}>
        <cylinderGeometry args={[0.09, 0.13, 6.2, 6]} />
        <meshStandardMaterial color="#31404f" roughness={0.7} metalness={0.5} />
      </instancedMesh>
      <instancedMesh ref={heads} args={[undefined, undefined, positions.length]}>
        <sphereGeometry args={[0.34, 8, 8]} />
        <meshStandardMaterial
          color="#ffe9b8"
          emissive="#ffd28a"
          emissiveIntensity={1.7}
          toneMapped={false}
        />
      </instancedMesh>
      {positions.map((p, i) => (
        <mesh key={i} position={[p.x, 0.62, p.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[4.2, 20]} />
          <meshBasicMaterial color="#ffce85" opacity={0.055} transparent depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function TrafficLights({ layout }: { layout: CityLayout }) {
  const subset = layout.intersections.filter((_, i) => i % 2 === 0).slice(0, 8);
  const refs = useRef<(THREE.MeshStandardMaterial | null)[]>([]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    refs.current.forEach((mat, i) => {
      if (!mat) return;
      const phase = (t * 0.35 + i * 0.7) % 3;
      mat.emissive.set(phase < 1 ? "#43ffa8" : phase < 2 ? "#ffb020" : "#ff4d5e");
      mat.emissiveIntensity = 2.2;
      mat.color.set(phase < 1 ? "#0f3a28" : phase < 2 ? "#3a2c0f" : "#3a1116");
    });
  });

  return (
    <group>
      {subset.map((p, i) => (
        <group key={i} position={[p.x + 3.6, 0.6, p.z + 3.6]}>
          <mesh position={[0, 2.2, 0]}>
            <cylinderGeometry args={[0.08, 0.08, 4.4, 6]} />
            <meshStandardMaterial color="#2b3947" metalness={0.5} roughness={0.6} />
          </mesh>
          <mesh position={[0, 4.5, 0]}>
            <boxGeometry args={[0.5, 1.1, 0.4]} />
            <meshStandardMaterial color="#18222e" roughness={0.8} />
          </mesh>
          <mesh position={[0, 4.5, 0.22]}>
            <sphereGeometry args={[0.16, 10, 10]} />
            <meshStandardMaterial
              ref={(m) => {
                refs.current[i] = m as THREE.MeshStandardMaterial | null;
              }}
              color="#3a1116"
              emissive="#ff4d5e"
              emissiveIntensity={2}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Vehicles({ layout, quality, reduced }: { layout: CityLayout; quality: Quality; reduced: boolean }) {
  const count = quality === "high" ? 12 : 5;
  const cars = useMemo(() => {
    const rand = mulberry32(7331);
    return Array.from({ length: count }, (_, i) => ({
      lane: i % 2 === 0 ? "h" : "v",
      offset: rand() * 120,
      speed: 4 + rand() * 6,
      fixed: (rand() - 0.5) * (layout.blocks.length ? layout.spacing * 3 : 60),
      color: ["#d9e6f2", "#8fb8d6", "#f0c987", "#88d6c0"][i % 4],
    }));
  }, [count, layout.spacing, layout.blocks.length]);

  const refs = useRef<(THREE.Group | null)[]>([]);

  useFrame((_, delta) => {
    if (reduced) return;
    const span = 150;
    cars.forEach((car, i) => {
      const g = refs.current[i];
      if (!g) return;
      car.offset = (car.offset + car.speed * delta) % span;
      const pos = -span / 2 + car.offset;
      if (car.lane === "h") {
        g.position.set(pos, 1.15, car.fixed);
        g.rotation.y = 0;
      } else {
        g.position.set(car.fixed, 1.15, pos);
        g.rotation.y = Math.PI / 2;
      }
    });
  });

  return (
    <group>
      {cars.map((car, i) => (
        <group
          key={i}
          ref={(g) => {
            refs.current[i] = g;
          }}
        >
          <mesh castShadow={quality === "high"}>
            <boxGeometry args={[3.4, 0.9, 1.6]} />
            <meshStandardMaterial color={car.color} roughness={0.4} metalness={0.5} />
          </mesh>
          <mesh position={[1.75, 0, 0]}>
            <boxGeometry args={[0.12, 0.36, 0.5]} />
            <meshStandardMaterial
              color="#fff6d8"
              emissive="#ffedb0"
              emissiveIntensity={1.6}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Marker({
  incident,
  index,
  selected,
  onSelect,
  reduced,
}: {
  incident: CityIncident;
  index: number;
  selected: boolean;
  onSelect: () => void;
  reduced: boolean;
}) {
  const pos = useMemo(() => projectToCity(incident.lat, incident.lng), [incident.lat, incident.lng]);
  const color = severityColor(incident.severity, incident.status);
  const ring = useRef<THREE.Mesh>(null);
  const core = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (ring.current) {
      const p = reduced ? 1 : 1 + Math.sin(t * 1.6 + index) * 0.16;
      ring.current.scale.setScalar(p * (hovered || selected ? 1.25 : 1));
      (ring.current.material as THREE.MeshBasicMaterial).opacity =
        0.25 + (reduced ? 0 : Math.sin(t * 1.6 + index) * 0.12) + (hovered ? 0.25 : 0);
    }
    if (core.current) {
      core.current.position.y = 9 + (reduced ? 0 : Math.sin(t * 0.9 + index) * 0.35);
      core.current.rotation.y = t * (reduced ? 0 : 0.6);
    }
  });

  return (
    <group position={[pos.x, 0, pos.z]}>
      <mesh
        position={[0, 0.8, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        ref={ring}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "auto";
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        <ringGeometry args={[1.5, 2.1, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.3} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      <mesh position={[0, 0.85, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.35, 28]} />
        <meshBasicMaterial color={color} transparent opacity={0.14} depthWrite={false} />
      </mesh>

      <mesh ref={core} position={[0, 9, 0]} onClick={onSelect} onPointerOver={() => setHovered(true)} onPointerOut={() => setHovered(false)}>
        <octahedronGeometry args={[0.85, 0]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={1.8}
          toneMapped={false}
          roughness={0.25}
        />
      </mesh>

      <mesh position={[0, 5, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 7.6, 5]} />
        <meshBasicMaterial color={color} transparent opacity={selected ? 0.7 : 0.3} depthWrite={false} />
      </mesh>

      <mesh position={[0, 1.1, 0]}>
        <cylinderGeometry args={[0.5, 1.1, 2.2, 6, 1, true]} />
        <meshBasicMaterial color={color} transparent opacity={0.12} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/**
 * The canvas host is sized by CSS, so the renderer is explicitly synchronised
 * with its container. Without this the drawing buffer stays at the 300×150
 * HTML default and the city renders into a corner of the viewport.
 */
function SizeGuard() {
  const { gl, camera } = useThree();

  useEffect(() => {
    const host = gl.domElement.parentElement;
    if (!host) return;

    // Size the drawing buffer directly rather than through React state, so the
    // canvas is correct even before the first animation frame runs (a hidden
    // tab never schedules one, and the buffer would stay 300×150).
    const canvas = gl.domElement;

    const measure = () => {
      // A hidden or not-yet-laid-out panel reports clientWidth 0, so fall back
      // to the bounding rect and then the grandparent before giving up.
      let width = host.clientWidth;
      let height = host.clientHeight;
      if (width < 2 || height < 2) {
        const rect = host.getBoundingClientRect();
        width = Math.round(rect.width);
        height = Math.round(rect.height);
      }
      if ((width < 2 || height < 2) && host.parentElement) {
        const rect = host.parentElement.getBoundingClientRect();
        width = Math.round(rect.width);
        height = Math.round(rect.height);
      }
      return { width, height };
    };

    const apply = () => {
      const { width, height } = measure();
      if (width < 2 || height < 2) return;
      // Keep the CSS box and the drawing buffer in agreement, otherwise the
      // browser scales a 300×150 buffer and the city looks squashed.
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      gl.setSize(width, height);
      const cam = camera as THREE.PerspectiveCamera;
      if (cam.isPerspectiveCamera) {
        cam.aspect = width / height;
        cam.updateProjectionMatrix();
      }
    };

    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(host);
    if (host.parentElement) observer.observe(host.parentElement);
    window.addEventListener("resize", apply);
    // Timers, not animation frames: a background tab never schedules a frame.
    const timers = [80, 250, 600, 1200, 2400].map((ms) => window.setTimeout(apply, ms));

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      observer.disconnect();
      window.removeEventListener("resize", apply);
    };
  }, [gl, camera]);

  return null;
}

function CameraRig({
  focus,
  resetSignal,
  controlsRef,
}: {
  focus: { x: number; z: number } | null;
  resetSignal: number;
  controlsRef: React.RefObject<any>;
}) {
  const { camera } = useThree();
  const target = useRef(new THREE.Vector3(0, 2, 0));
  const desired = useRef<THREE.Vector3 | null>(null);
  const initialised = useRef(false);

  useEffect(() => {
    if (!focus) {
      target.current.set(0, 2, 0);
      desired.current = new THREE.Vector3(0, 118, 138);
    } else {
      target.current.set(focus.x, 4, focus.z);
      desired.current = new THREE.Vector3(focus.x + 18, 62, focus.z + 68);
    }
  }, [focus, resetSignal]);

  useFrame(() => {
    const controls = controlsRef.current;
    if (controls) {
      controls.target.lerp(target.current, 0.06);
      controls.update();
    }
    if (desired.current) {
      camera.position.lerp(desired.current, 0.05);
      if (camera.position.distanceTo(desired.current) < 0.8) desired.current = null;
    }
    if (!initialised.current) {
      camera.position.set(0, 118, 138);
      initialised.current = true;
    }
  });

  return null;
}

function Scene({
  incidents,
  quality,
  selectedId,
  onSelect,
  focus,
  resetSignal,
  onHoverBuilding,
  onInspectBlock,
  reduced,
}: {
  incidents: CityIncident[];
  quality: Quality;
  selectedId: string | null;
  onSelect: (id: string) => void;
  focus: { x: number; z: number } | null;
  resetSignal: number;
  onHoverBuilding: (b: { x: number; z: number } | null, screen?: { x: number; y: number }) => void;
  onInspectBlock: (world: { x: number; z: number }) => void;
  reduced: boolean;
}) {
  const layout = useMemo(() => generateCity(quality), [quality]);
  const controlsRef = useRef<any>(null);
  const groupRef = useRef<THREE.Group>(null);
  const { pointer } = useThree();

  useFrame(() => {
    // Sizing is handled by SizeGuard's ResizeObserver. It must NOT happen here:
    // updating React state from the render loop re-rendered the whole tree every
    // frame, which made the page look like it was continuously reloading.
    if (!groupRef.current || reduced) return;
    const g = groupRef.current;
    g.rotation.y += (pointer.x * 0.04 - g.rotation.y) * 0.05;
    g.rotation.x += (-pointer.y * 0.02 - g.rotation.x) * 0.05;
  });

  return (
    <>
      <color attach="background" args={["#080d17"]} />
      <fog attach="fog" args={["#080d17", 190, 400]} />

      <ambientLight intensity={0.45} />
      <hemisphereLight args={["#4a6d8c", "#070b12", 0.7]} />
      <directionalLight
        position={[70, 110, 60]}
        intensity={1.1}
        color="#cfe6ff"
        castShadow={quality === "high"}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-140}
        shadow-camera-right={140}
        shadow-camera-top={140}
        shadow-camera-bottom={-140}
        shadow-bias={-0.0006}
      />
      <pointLight position={[-70, 40, -60]} intensity={90} color="#2b7f9e" distance={220} />
      <pointLight position={[80, 30, 70]} intensity={60} color="#2f8f76" distance={180} />

      <CameraRig focus={focus} resetSignal={resetSignal} controlsRef={controlsRef} />

      <group ref={groupRef}>
        <Roads layout={layout} quality={quality} />
        <BlockFloors layout={layout} />
        <Buildings
          layout={layout}
          quality={quality}
          onHover={onHoverBuilding}
          onSelect={onInspectBlock}
          selectedBlock={null}
        />
        <StreetLights layout={layout} />
        <TrafficLights layout={layout} />
        <Vehicles layout={layout} quality={quality} reduced={reduced} />
        {incidents.map((incident, i) => (
          <Marker
            key={incident.id}
            incident={incident}
            index={i}
            selected={selectedId === incident.id}
            onSelect={() => onSelect(incident.id)}
            reduced={reduced}
          />
        ))}
        <ContactShadows
          position={[0, 0.6, 0]}
          opacity={0.45}
          scale={330}
          blur={2.4}
          far={60}
          resolution={quality === "high" ? 512 : 256}
          color="#02060c"
        />
      </group>

      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        enableDamping
        dampingFactor={0.075}
        rotateSpeed={0.55}
        zoomSpeed={0.7}
        minDistance={60}
        maxDistance={260}
        minPolarAngle={0.35}
        maxPolarAngle={Math.PI / 2.35}
        target={[0, 2, 0]}
      />
    </>
  );
}

export default function CityScene(props: React.ComponentProps<typeof Scene>) {
  return (
    <Canvas
      shadows={props.quality === "high"}
      dpr={props.quality === "high" ? [1, 2] : props.quality === "balanced" ? [1, 1.5] : 1}
      camera={{ position: [0, 118, 138], fov: 34, near: 0.5, far: 900 }}
      gl={{ antialias: props.quality !== "low", powerPreference: "high-performance" }}
      style={{ position: "absolute", inset: 0, touchAction: "none" }}
    >
      <SizeGuard />
      <Scene {...props} />
    </Canvas>
  );
}
