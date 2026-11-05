"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, Line, OrbitControls } from "@react-three/drei";
import { useReducedMotion } from "framer-motion";
import * as THREE from "three";
import { FACILITY_COLORS, type Facility, type FacilityLocation, type FacilityRoute, type MapGeometry } from "@/lib/emergency/facilities-types";

type Project = (lat: number, lng: number) => [number, number, number];

function FacilityMarker({ facility, position, selected, onSelect, reducedMotion }: { facility: Facility; position: [number, number, number]; selected: boolean; onSelect: (facility: Facility) => void; reducedMotion: boolean }) {
  const pulse = useRef<THREE.Mesh>(null);
  const [hover, setHover] = useState(false);
  const color = FACILITY_COLORS[facility.kind];
  useFrame(({ clock }) => {
    if (pulse.current && !reducedMotion) pulse.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 2) * 0.12);
  });
  return <group position={position}>
    <mesh position={[0, 0.8, 0]} onClick={(event) => { event.stopPropagation(); onSelect(facility); }} onPointerOver={(event) => { event.stopPropagation(); setHover(true); }} onPointerOut={() => setHover(false)}>
      <boxGeometry args={[1.4, 1.6, 1.1]} /><meshStandardMaterial color={selected ? "#ffffff" : color} emissive={color} emissiveIntensity={hover || selected ? 0.7 : 0.25} roughness={0.3} metalness={0.25} />
    </mesh>
    <mesh ref={pulse} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.12, 0]}><ringGeometry args={[1.4, 1.8, 40]} /><meshBasicMaterial color={color} transparent opacity={selected ? 0.8 : 0.25} side={THREE.DoubleSide} /></mesh>
    <Html position={[0, 3, 0]} center zIndexRange={[25, 0]} distanceFactor={70}>
      <button type="button" onClick={() => onSelect(facility)} className={`facility-scene-label${hover || selected ? " visible" : ""}`} aria-label={`View ${facility.name}`} style={{ borderColor: color }}>{hover || selected ? facility.name : facility.kind === "hospital" || facility.kind === "clinic" ? "+" : facility.kind.slice(0, 1).toUpperCase()}</button>
    </Html>
  </group>;
}

function BuildingOutline({ building, project, scale }: { building: MapGeometry["buildings"][number]; project: Project; scale: number }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    building.points.forEach((point, index) => { const [x, , z] = project(point.lat, point.lng); if (index === 0) shape.moveTo(x, -z); else shape.lineTo(x, -z); });
    return new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.15, Math.min(6, (building.height ?? 6) * scale)), bevelEnabled: false });
  }, [building, project, scale]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}><meshStandardMaterial color="#1b3146" metalness={0.2} roughness={0.65} /></mesh>;
}

function World({ facilities, location, selectedId, onSelect, geometry, route }: { facilities: Facility[]; location: FacilityLocation; selectedId: string | null; onSelect: (facility: Facility) => void; geometry: MapGeometry; route: FacilityRoute | null }) {
  const reducedMotion = Boolean(useReducedMotion());
  const scale = useMemo(() => {
    const radius = Math.max(750, ...facilities.map((facility) => facility.distanceKm * 1000));
    return 43 / radius;
  }, [facilities]);
  const project: Project = useMemo(() => (lat, lng) => [(lng - location.lng) * Math.cos(location.lat * Math.PI / 180) * 111320 * scale, 0, -(lat - location.lat) * 111320 * scale], [location, scale]);
  return <>
    <color attach="background" args={["#080d17"]} />
    <ambientLight intensity={0.9} /><directionalLight position={[30, 60, 40]} intensity={2} color="#bcecff" />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}><circleGeometry args={[66, 80]} /><meshStandardMaterial color="#101d2d" roughness={0.9} /></mesh>
    <gridHelper args={[120, 24, "#294253", "#183041"]} />
    {geometry.roads.filter((road) => road.points.length > 1).map((road) => <Line key={road.id} points={road.points.map((point) => { const [x, , z] = project(point.lat, point.lng); return [x, 0.08, z] as [number, number, number]; })} color="#496174" lineWidth={2} transparent opacity={0.7} />)}
    {geometry.buildings.map((building) => <BuildingOutline key={building.id} building={building} project={project} scale={scale} />)}
    {route && route.points.length > 1 && <Line points={route.points.map((point) => { const [x, , z] = project(point.lat, point.lng); return [x, 0.4, z] as [number, number, number]; })} color="#36d9ff" lineWidth={3} />}
    {facilities.map((facility) => <FacilityMarker key={facility.id} facility={facility} position={project(facility.lat, facility.lng)} selected={selectedId === facility.id} onSelect={onSelect} reducedMotion={reducedMotion} />)}
    <mesh position={[0, 0.8, 0]}><sphereGeometry args={[0.8, 20, 20]} /><meshStandardMaterial color="#f5b94b" emissive="#f5b94b" emissiveIntensity={0.45} /></mesh>
    <Html position={[0, 2.6, 0]} center zIndexRange={[20, 0]}><span className="facility-scene-location">Your search location</span></Html>
    <OrbitControls makeDefault enablePan enableZoom minDistance={15} maxDistance={160} maxPolarAngle={Math.PI / 2.15} />
  </>;
}

export default function FacilityScene(props: { facilities: Facility[]; location: FacilityLocation; selectedId: string | null; onSelect: (facility: Facility) => void; geometry: MapGeometry; route: FacilityRoute | null; onFailure: () => void }) {
  const failure = useRef(props.onFailure);
  failure.current = props.onFailure;
  return <div className="facility-map-surface" aria-label="3D geographic facility map. Drag to rotate, scroll or pinch to zoom.">
    <Canvas camera={{ position: [48, 58, 58], fov: 48 }} dpr={[1, 1.5]} gl={{ antialias: true, powerPreference: "low-power" }} onCreated={({ gl }) => { gl.domElement.addEventListener("webglcontextlost", (event) => { event.preventDefault(); failure.current(); }, { once: true }); }}>
      <World {...props} />
    </Canvas>
    <p className="facility-map-caption">Actual facility coordinates. Building symbols and unknown heights are illustrative; roads and outlines use OpenStreetMap where available.</p>
  </div>;
}
