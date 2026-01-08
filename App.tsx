
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { ShaderCanvas, ShaderCanvasHandle } from './components/ShaderCanvas';
import { initialScene } from './constants/initialScene';
import { MAX_OPS } from './constants/config';

// --- TYPES ---

interface Geometry {
  type: number; // 0:Box, 1:Ellipse, 2:Cylinder, 3:Cone, 4:Segment
  pos: [number, number, number];
  size: [number, number, number];
  axis: [number, number, number];
  angle: number;
  matId: number;
}

interface OpNode {
  id: string;
  name: string;
  type: number; // 0:ADD, 1:UNION, 2:SUB, 3:INTER, 6:AABB
  geometry?: Geometry;
  children?: OpNode[];
  isOut: boolean;
}

interface Material {
  id: number;
  name: string;
  color: [number, number, number];
  type: number; // 0:LAMBERTIAN, 1:METAL, 2:DIELECTRIC, 3:EMISSIVE
  roughness: number;
}

interface Scene {
  name: string;
  materials: Material[];
  logic: OpNode[];
}

// --- CONSTANTS ---

const SHAPE_TYPES = ["Box", "Ellipse", "Cyl", "Cone", "Seg"];
const OP_TYPES: Record<number, string> = { 0: "ADD", 1: "UNION", 2: "SUB", 3: "INTER", 6: "AABB" };
const MAT_TYPES = ["LAMB", "METAL", "DIEL", "EMIS"];
const GLSL_MAT_TYPES = ["LAMBERTIAN", "METAL", "DIELECTRIC", "EMISSIVE"];
const PI = Math.PI;

const createDefaultGeom = (matId = 0): Geometry => ({
  type: 0, pos: [0, 0, 0], size: [1, 1, 1], axis: [0, 1, 0], angle: 0, matId
});

// --- APP ---

const App: React.FC = () => {
  const [scene, setSceneState] = useState<Scene>(initialScene as unknown as Scene);
  const [past, setPast] = useState<Scene[]>([]);
  const [future, setFuture] = useState<Scene[]>([]);
  
  const [activeTab, setActiveTab] = useState<'logic' | 'materials'>('logic');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showData, setShowData] = useState(true);
  const [draggedPath, setDraggedPath] = useState<number[] | null>(null);
  const [isFastRender, setIsFastRender] = useState(false);
  
  const shaderRef = useRef<ShaderCanvasHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Custom setScene with history support
  const setScene = (newScene: Scene | ((prev: Scene) => Scene), saveHistory = true) => {
    if (saveHistory) {
      setPast(prev => [...prev, JSON.parse(JSON.stringify(scene))]);
      setFuture([]);
    }
    if (typeof newScene === 'function') {
      setSceneState(newScene);
    } else {
      setSceneState(newScene);
    }
  };

  const handleUndo = () => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    const newPast = past.slice(0, past.length - 1);
    
    setFuture(prev => [JSON.parse(JSON.stringify(scene)), ...prev]);
    setPast(newPast);
    setSceneState(previous);
  };

  const handleRedo = () => {
    if (future.length === 0) return;
    const next = future[0];
    const newFuture = future.slice(1);
    
    setPast(prev => [...prev, JSON.parse(JSON.stringify(scene))]);
    setFuture(newFuture);
    setSceneState(next);
  };

  const handleNew = () => {
    const emptyScene: Scene = {
      ...scene,
      name: "New Scene",
      logic: []
    };
    setScene(emptyScene);
  };

  const usedMaterialIds = useMemo(() => {
    const ids = new Set<number>();
    const walk = (nodes: OpNode[]) => {
      nodes.forEach(n => {
        if (n.geometry) ids.add(n.geometry.matId);
        if (n.children) walk(n.children);
      });
    };
    walk(scene.logic);
    return ids;
  }, [scene.logic]);

  const syncToGPU = () => {
    const buffer = new Float32Array(MAX_OPS * 6 * 4).fill(-1.0);
    const flatShapes: Geometry[] = [];
    const flatOps: any[] = [];

    const processNode = (node: OpNode) => {
      let shapeIdx = -1;
      if (node.geometry) {
        shapeIdx = flatShapes.length;
        flatShapes.push(node.geometry);
      }
      const opEntry = {
        type: node.type,
        shapeIdx,
        jumpTo: 0,
        isOut: node.isOut ? 1 : 0
      };
      flatOps.push(opEntry);

      if (node.type === 6) {
        node.children?.forEach(processNode);
        opEntry.jumpTo = flatOps.length;
      }
    };

    scene.logic.forEach(processNode);

    flatShapes.slice(0, MAX_OPS).forEach((s, i) => {
      buffer.set([s.pos[0], s.pos[1], s.pos[2], s.type], (0 * MAX_OPS + i) * 4);
      buffer.set([s.size[0], s.size[1], s.size[2], s.matId], (1 * MAX_OPS + i) * 4);
      buffer.set([s.axis[0], s.axis[1], s.axis[2], s.angle], (2 * MAX_OPS + i) * 4);
    });

    flatOps.slice(0, MAX_OPS).forEach((op, i) => {
      const idx = (3 * MAX_OPS + i) * 4;
      if (op.type === 6) {
        const safeJump = Math.min(op.jumpTo, MAX_OPS);
        buffer.set([6, op.shapeIdx, safeJump, op.isOut], idx);
      } else {
        buffer.set([op.type, op.shapeIdx, 0, op.isOut], idx);
      }
    });

    scene.materials.forEach((m) => {
      if (m.id >= 0 && m.id < MAX_OPS) {
        buffer.set([m.color[0], m.color[1], m.color[2], m.type + m.roughness], (4 * MAX_OPS + m.id) * 4);
      }
    });

    buffer[(5 * MAX_OPS + 0) * 4] = 1.0; 
    buffer[(5 * MAX_OPS + 3) * 4] = isFastRender ? 1.0 : 0.0; 
    
    shaderRef.current?.updateBufferData(buffer);
  };

  useEffect(() => {
    syncToGPU();
  }, [scene, isFastRender]);

  useEffect(() => {
    const timer = setTimeout(() => {
      syncToGPU();
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  const handleSetExpandedId = (id: string | null) => {
    setExpandedId(id);
    setTimeout(syncToGPU, 50);
  };

  const toSRGB = (c: number) => c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1.0/2.4) - 0.055;
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const RGBToHex = (r: number, g: number, b: number) => {
    const f = (n: number) => Math.round(toSRGB(n) * 255).toString(16).padStart(2, '0');
    return `#${f(r)}${f(g)}${f(b)}`;
  };
  const HexToRGB = (hex: string): [number, number, number] => {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return [toLinear(r), toLinear(g), toLinear(b)];
  };

  const getListAtPath = (logic: OpNode[], path: number[]) => {
    if (path.length === 0) return null;
    let list = logic;
    for (let i = 0; i < path.length - 1; i++) {
      const node = list[path[i]];
      if (!node) return null;
      if (!node.children) node.children = [];
      list = node.children;
    }
    return list;
  };

  const deleteNode = (path: number[]) => {
    const newScene = JSON.parse(JSON.stringify(scene));
    const list = getListAtPath(newScene.logic, path);
    if (list) {
      list.splice(path[path.length - 1], 1);
      setScene(newScene);
    }
  };

  const duplicateNode = (path: number[]) => {
    const newScene = JSON.parse(JSON.stringify(scene));
    const list = getListAtPath(newScene.logic, path);
    if (list) {
      const original = list[path[path.length - 1]];
      const clone = JSON.parse(JSON.stringify(original));
      clone.id = Math.random().toString(36).substr(2, 9);
      clone.name = `${original.name} (Copy)`;
      if (clone.geometry) {
        clone.geometry.pos[0] += 1.0;
      }
      list.splice(path[path.length - 1] + 1, 0, clone);
      setScene(newScene);
      handleSetExpandedId(clone.id);
    }
  };

  const handleDragStart = (path: number[]) => setDraggedPath(path);
  
  const handleDrop = (targetPath: number[], asChild = false) => {
    if (!draggedPath) return;
    const newScene = JSON.parse(JSON.stringify(scene));
    let sourceList = getListAtPath(newScene.logic, draggedPath);
    if (!sourceList) return;
    const [node] = sourceList.splice(draggedPath[draggedPath.length - 1], 1);
    let actualTargetPath = [...targetPath];
    if (asChild) {
      let currentList = newScene.logic;
      for (let i = 0; i < actualTargetPath.length; i++) {
        const parent = currentList[actualTargetPath[i]];
        if (!parent) return;
        if (!parent.children) parent.children = [];
        currentList = parent.children;
      }
      currentList.push(node);
    } else {
      let destList = getListAtPath(newScene.logic, actualTargetPath);
      if (destList) destList.splice(actualTargetPath[actualTargetPath.length - 1], 0, node);
    }
    setScene(newScene);
    setDraggedPath(null);
  };

  const copyGLSL = () => {
    const flatShapes: Geometry[] = [];
    const flatOps: any[] = [];
    const processNode = (node: OpNode) => {
      let shapeIdx = -1;
      if (node.geometry) {
        shapeIdx = flatShapes.length;
        flatShapes.push(node.geometry);
      }
      const opEntry = { name: node.name, type: node.type, shapeIdx, jumpTo: 0, isOut: node.isOut ? 1 : 0 };
      flatOps.push(opEntry);
      if (node.type === 6) {
        node.children?.forEach(processNode);
        opEntry.jumpTo = flatOps.length;
      }
    };
    scene.logic.forEach(processNode);

    const fv3 = (v: [number, number, number]) => `vec3(${v[0].toFixed(3)},${v[1].toFixed(3)},${v[2].toFixed(3)})`;
    const shCode = flatShapes.map((s, i) => `        SHAPE(${fv3(s.pos)}, ${fv3(s.size)}, ${s.type.toFixed(1)}, ${s.matId.toFixed(1)}, ${fv3(s.axis)}, ${s.angle.toFixed(3)})${i===flatShapes.length-1?'':','} // ${i} ${SHAPE_TYPES[s.type]}`).join("\n");
    const opsCode = flatOps.map((op, i) => {
      const val = `vec4(${op.type.toFixed(1)}, ${op.shapeIdx.toFixed(1)}, ${op.jumpTo.toFixed(1)}, ${op.isOut.toFixed(1)})`;
      return `        ${val}${i===flatOps.length-1?'':','} // ${i} ${op.name} (${OP_TYPES[op.type]})`;
    }).join("\n");
    const matCode = scene.materials.map((m, i) => `        vec4(${fv3(m.color)}, ${GLSL_MAT_TYPES[m.type]}+${m.roughness.toFixed(3)})${i===scene.materials.length-1?'':','} // ${i} ${m.name}`).join("\n");

    const code = `    const int NSH  = ${flatShapes.length};
    const int NOPS = ${flatOps.length};
    const int NMAT = ${scene.materials.length};
    #define SHAPE(P,BB,SH,M,AX,ANG) vec4((P),(SH)), vec4((BB),(M)), vec4((AX),(ANG))
    vec4 SH[NSH*3] = vec4[NSH*3](\n${shCode}\n    );
    vec4 OPS[NOPS] = vec4[NOPS](\n${opsCode}\n    );
    vec4 MAT[NMAT] = vec4[NMAT](\n${matCode}\n    );`;

    navigator.clipboard.writeText(code).then(() => alert("GLSL code copied!"));
  };

  const NumberInputWithButtons = ({ label, value, step = 0.5, onChange }: any) => (
    <div className="flex flex-col gap-0.5 group w-full overflow-hidden">
      <div className="flex justify-between text-[7px] uppercase font-black text-sky-400 px-0.5">
        <span>{label}</span>
      </div>
      <div className="flex items-center gap-1 w-full">
        <button onClick={() => onChange(parseFloat((value - step).toFixed(2)))} className="w-5 h-5 flex-shrink-0 flex items-center justify-center bg-sky-50 text-sky-600 border border-sky-100 rounded hover:bg-sky-500 hover:text-white transition-colors text-[10px] font-bold">-</button>
        <div className="flex-1 relative h-5 flex items-center">
          <input 
            type="number" 
            step="0.01" 
            value={Number(value).toFixed(2)} 
            onChange={e => onChange(parseFloat(parseFloat(e.target.value).toFixed(2)))} 
            className="w-full bg-white border border-sky-100 rounded px-1 py-0.5 text-[9px] font-bold text-sky-700 outline-none focus:border-sky-400 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" 
          />
        </div>
        <button onClick={() => onChange(parseFloat((value + step).toFixed(2)))} className="w-5 h-5 flex-shrink-0 flex items-center justify-center bg-sky-50 text-sky-600 border border-sky-100 rounded hover:bg-sky-500 hover:text-white transition-colors text-[10px] font-bold">+</button>
      </div>
    </div>
  );

  const SliderSimple = ({ label, value, min, max, step = 0.1, onChange }: any) => (
    <div className="flex flex-col flex-1 gap-0.5">
      <div className="flex justify-between text-[8px] uppercase font-black text-sky-400">
        <span>{label}</span>
        <span className="text-sky-600">{Number(value).toFixed(2)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} className="w-full h-1 bg-sky-100 rounded-lg appearance-none cursor-pointer accent-sky-500" />
    </div>
  );

  const renderLogicNode = (node: OpNode, path: number[]) => {
    const isExpanded = expandedId === node.id;
    const isAABB = node.type === 6;

    const updateNode = (fields: Partial<OpNode>) => {
      const next = JSON.parse(JSON.stringify(scene));
      const list = getListAtPath(next.logic, path);
      if (list && list[path[path.length - 1]]) {
        list[path[path.length - 1]] = { ...list[path[path.length - 1]], ...fields };
        setScene(next);
      }
    };

    return (
      <div key={node.id} onDragOver={e => { e.preventDefault(); e.stopPropagation(); }} onDrop={e => { e.stopPropagation(); handleDrop(path, false); }} className="mb-1">
        <div className={`border rounded-lg transition-all shadow-sm overflow-hidden ${node.isOut ? 'bg-emerald-50 border-emerald-300 ring-1 ring-emerald-200' : isExpanded ? 'bg-sky-50 border-sky-300' : 'bg-white border-sky-100'}`}>
          <div draggable onDragStart={(e) => { e.stopPropagation(); handleDragStart(path); }} className="flex items-center px-2 py-1.5 gap-2 cursor-grab active:cursor-grabbing hover:bg-sky-50/50">
            <div onClick={() => handleSetExpandedId(isExpanded ? null : node.id)} className="flex-1 cursor-pointer flex items-center justify-between overflow-hidden">
              <div className="flex items-center gap-2 overflow-hidden">
                <div className={`w-1.5 h-1.5 flex-shrink-0 rounded-full ${isAABB ? 'bg-amber-400' : 'bg-sky-400'}`} />
                <div className="flex items-baseline gap-2 overflow-hidden">
                  <span className="text-[10px] font-black text-sky-800 leading-none truncate">{node.name}</span>
                  {!isExpanded && <span className="text-[7px] font-bold text-sky-400 uppercase tracking-tighter truncate opacity-80">{OP_TYPES[node.type]} • {SHAPE_TYPES[node.geometry?.type || 0]}</span>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button onClick={e => { e.stopPropagation(); duplicateNode(path); }} title="Duplicate" className="text-sky-300 hover:text-sky-600 transition-colors">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg>
              </button>
              {!(node.children && node.children.length) && (
                <button onClick={e => { e.stopPropagation(); deleteNode(path); }} title="Delete" className="text-rose-200 hover:text-rose-500 transition-colors">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </div>
          </div>
          {isExpanded && (
            <div className="p-2 border-t border-sky-100 space-y-3 bg-white/50">
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="text-[7px] font-black text-sky-400 uppercase">Name</label>
                  <input type="text" value={node.name} onChange={e => updateNode({ name: e.target.value })} className="w-full bg-white border border-sky-100 rounded px-1.5 py-0.5 text-[9px] font-bold text-sky-700 outline-none focus:border-sky-400" />
                </div>
                <div>
                  <label className="text-[7px] font-black text-sky-400 uppercase">Op</label>
                  <select value={node.type} onChange={e => updateNode({ type: parseInt(e.target.value) })} className="w-full bg-white border border-sky-100 rounded py-0.5 text-[9px] font-bold text-sky-700">
                    {Object.entries(OP_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              </div>
              {node.geometry && (
                <div className="space-y-3 bg-white rounded p-2 border border-sky-50 shadow-inner">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[7px] font-black text-sky-400 uppercase">Shape</label>
                      <select value={node.geometry.type} onChange={e => updateNode({ geometry: { ...node.geometry!, type: parseInt(e.target.value) } })} className="w-full text-[9px] font-bold text-sky-700 border rounded py-0.5">
                        {SHAPE_TYPES.map((t, i) => <option key={i} value={i}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[7px] font-black text-sky-400 uppercase">Material</label>
                      <select value={node.geometry.matId} onChange={e => updateNode({ geometry: { ...node.geometry!, matId: parseInt(e.target.value) } })} className="w-full text-[9px] font-bold text-sky-700 border rounded py-0.5">
                        {scene.materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2 border-r border-sky-50 pr-2">
                      <NumberInputWithButtons label="Pos X" value={node.geometry.pos[0]} onChange={(v:any) => updateNode({ geometry: { ...node.geometry!, pos: [v, node.geometry!.pos[1], node.geometry!.pos[2]] } })} />
                      <NumberInputWithButtons label="Pos Y" value={node.geometry.pos[1]} onChange={(v:any) => updateNode({ geometry: { ...node.geometry!, pos: [node.geometry!.pos[0], v, node.geometry!.pos[2]] } })} />
                      <NumberInputWithButtons label="Pos Z" value={node.geometry.pos[2]} onChange={(v:any) => updateNode({ geometry: { ...node.geometry!, pos: [node.geometry!.pos[0], node.geometry!.pos[1], v] } })} />
                    </div>
                    <div className="space-y-2">
                      <NumberInputWithButtons label="Size W" value={node.geometry.size[0]} onChange={(v:any) => updateNode({ geometry: { ...node.geometry!, size: [v, node.geometry!.size[1], node.geometry!.size[2]] } })} />
                      <NumberInputWithButtons label="Size H" value={node.geometry.size[1]} onChange={(v:any) => updateNode({ geometry: { ...node.geometry!, size: [node.geometry!.size[0], v, node.geometry!.size[2]] } })} />
                      <NumberInputWithButtons label="Size D" value={node.geometry.size[2]} onChange={(v:any) => updateNode({ geometry: { ...node.geometry!, size: [node.geometry!.size[0], node.geometry!.size[1], v] } })} />
                    </div>
                  </div>
                  <div className="bg-sky-50/50 p-2 rounded space-y-2">
                    <div className="flex items-center justify-between"><span className="text-[7px] font-black text-sky-400 uppercase">Rotation</span><select className="text-[8px] font-bold text-sky-700 bg-white border border-sky-100 rounded px-1" value={node.geometry.axis.join(',')} onChange={e => updateNode({ geometry: { ...node.geometry!, axis: e.target.value.split(',').map(Number) as [number, number, number] } })}><option value="1,0,0">X Axis</option><option value="0,1,0">Y Axis</option><option value="0,0,1">Z Axis</option></select></div>
                    <SliderSimple label="Angle (Snap 45°)" value={node.geometry.angle} min={-PI} max={PI} step={PI / 4} onChange={(v:any) => updateNode({ geometry: { ...node.geometry!, angle: v } })} />
                  </div>
                </div>
              )}
              <div className="flex gap-4 px-1 pt-1 border-t border-sky-100/50">
                <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={node.isOut} onChange={e => updateNode({ isOut: e.target.checked })} className="w-3 h-3 accent-sky-500 rounded" /><span className="text-[7px] font-black text-sky-400 uppercase">Visible Output</span></label>
              </div>
              {isAABB && (
                <button onClick={() => updateNode({ children: [...(node.children || []), { id: Math.random().toString(), name: "New Op", type: 0, geometry: createDefaultGeom(node.geometry?.matId || 0), isOut: true }] })} className="w-full py-1 bg-sky-100 text-sky-600 text-[8px] font-black uppercase rounded hover:bg-sky-500 hover:text-white transition-all">+ Add Child</button>
              )}
            </div>
          )}
        </div>
        {isAABB && node.children && <div className="ml-2 pl-2 border-l border-sky-100 mt-1">{node.children.map((child, idx) => renderLogicNode(child, [...path, idx]))}</div>}
      </div>
    );
  };

  return (
    <div className="flex w-screen h-screen bg-sky-100 overflow-hidden font-sans">
      <div className="flex-1 relative">
        <ShaderCanvas ref={shaderRef} />
        <div className="absolute top-4 left-4 z-20 flex gap-2">
          <button onClick={syncToGPU} className="px-5 h-10 bg-sky-500 text-white font-black uppercase tracking-widest text-xs rounded-xl shadow-lg hover:bg-sky-600 transition-all active:scale-95 flex items-center gap-2">Force Sync</button>
           <button onClick={() => setIsFastRender(!isFastRender)} className={`px-3 py-1.5 h-10 backdrop-blur-md text-[10px] font-black uppercase rounded-xl border shadow-lg transition-all flex items-center gap-2 ${isFastRender ? 'bg-amber-500/80 text-white border-amber-600' : 'bg-white/80 text-sky-500 border-sky-100'}`}><div className={`w-1.5 h-1.5 rounded-full ${isFastRender ? 'bg-white animate-pulse' : 'bg-sky-300'}`}></div>Fast Rendering</button>
          <button onClick={() => { setShowData(!showData); setTimeout(syncToGPU, 1000); }} className={`w-10 h-10 bg-white/90 border border-sky-100 rounded-xl shadow flex items-center justify-center text-sky-500 ${showData ? 'ring-2 ring-sky-400' : ''}`}><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" /></svg></button>
        </div>
      </div>

      <div className="h-full bg-white/95 border-l border-sky-50 shadow-2xl transition-all duration-300 flex flex-col" style={{ width: showData ? '360px' : '0px' }}>
        <div className="w-[360px] flex-shrink-0 flex flex-col h-full overflow-hidden">
          <div className="p-4 flex flex-col gap-3">
            <div className="flex justify-between items-center gap-2">
              <input 
                type="text" 
                value={scene.name} 
                onChange={e => setScene({ ...scene, name: e.target.value })} 
                className="flex-1 w-0 text-lg font-black text-sky-800 tracking-tighter uppercase bg-transparent border-b-2 border-transparent hover:border-sky-100 focus:border-sky-400 outline-none truncate pb-0.5" 
                placeholder="Scene Name" 
              />
              <div className="flex gap-2 flex-shrink-0">
                 <button onClick={handleUndo} disabled={past.length === 0} className={`text-[8px] font-black uppercase ${past.length === 0 ? 'text-gray-300 cursor-not-allowed' : 'text-sky-400 hover:text-sky-600'} transition-colors`}>Undo</button>
                 <button onClick={handleRedo} disabled={future.length === 0} className={`text-[8px] font-black uppercase ${future.length === 0 ? 'text-gray-300 cursor-not-allowed' : 'text-sky-400 hover:text-sky-600'} transition-colors`}>Redo</button>
                 <button onClick={handleNew} className="text-[8px] font-black uppercase text-sky-400 hover:text-sky-600 transition-colors">New</button>
              </div>
            </div>
            
            <div className="flex justify-between items-center px-1">
              <div className="flex gap-3">
                 <button onClick={() => { const a = document.createElement('a'); const json = JSON.stringify(scene, null, 2); a.href = URL.createObjectURL(new Blob([json], {type: 'application/json'})); a.download = `${(scene.name || "untitled").toLowerCase().replace(/\s+/g, '-')}.json`; a.click(); }} className="text-[8px] font-black uppercase text-sky-400 hover:text-sky-600 transition-colors">Export JSON</button>
                 <button onClick={() => fileInputRef.current?.click()} className="text-[8px] font-black uppercase text-sky-400 hover:text-sky-600 transition-colors">Import JSON</button>
                 <input ref={fileInputRef} type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if(f) { const r = new FileReader(); r.onload = ev => { try { const d = JSON.parse(ev.target?.result as string); if (d && d.logic && d.materials) { if (!d.name) d.name = f.name.replace('.json', ''); setScene(d); } } catch(err) { alert("Invalid JSON"); } }; r.readAsText(f); } }} />
              </div>
              <button onClick={copyGLSL} className="text-[8px] font-black uppercase text-amber-500 hover:text-amber-600 transition-colors">Copy GLSL</button>
            </div>

            <div className="flex bg-sky-50 p-1 rounded-xl border border-sky-100">
              <button onClick={() => setActiveTab('logic')} className={`flex-1 py-1.5 text-[9px] font-black uppercase rounded-lg transition-all ${activeTab === 'logic' ? 'bg-white text-sky-600 shadow-sm' : 'text-sky-400'}`}>Logic Hierarchy</button>
              <button onClick={() => setActiveTab('materials')} className={`flex-1 py-1.5 text-[9px] font-black uppercase rounded-lg transition-all ${activeTab === 'materials' ? 'bg-white text-sky-600 shadow-sm' : 'text-sky-400'}`}>Materials</button>
            </div>
            {activeTab === 'logic' && <button onClick={() => setScene({ ...scene, logic: [...scene.logic, { id: Math.random().toString(), name: "Root Op", type: 0, geometry: createDefaultGeom(0), isOut: true }] })} className="w-full py-2 bg-sky-500 text-white text-[9px] font-black uppercase rounded-lg shadow-md hover:bg-sky-600 transition-all">+ Add Root Operation</button>}
            {activeTab === 'materials' && <button onClick={() => setScene({ ...scene, materials: [...scene.materials, { id: scene.materials.length, name: "New Mat", color: [0.5, 0.5, 0.5], type: 0, roughness: 0.5 }] })} className="w-full py-2 bg-sky-500 text-white text-[9px] font-black uppercase rounded-lg shadow-md hover:bg-sky-600 transition-all">+ Add Material</button>}
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2 select-none" onMouseDown={e => e.stopPropagation()}>
            {activeTab === 'logic' && scene.logic.map((node, i) => renderLogicNode(node, [i]))}
            {activeTab === 'materials' && scene.materials.map((mat, i) => {
              const isUsed = usedMaterialIds.has(mat.id);
              const isExpanded = expandedId === `mat-${mat.id}`;
              const updateMat = (fields: Partial<Material>) => { const next = JSON.parse(JSON.stringify(scene)); next.materials[i] = { ...next.materials[i], ...fields }; setScene(next); };
              return (
                <div key={i} className={`border rounded-lg bg-white transition-all border-sky-100 shadow-sm ${!isUsed ? 'opacity-40 grayscale' : 'hover:border-sky-300'}`}>
                  <div className="p-2.5 flex items-center justify-between cursor-pointer" onClick={() => handleSetExpandedId(isExpanded ? null : `mat-${mat.id}`)}>
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg shadow-inner border border-sky-100" style={{ backgroundColor: RGBToHex(mat.color[0], mat.color[1], mat.color[2]) }}></div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-sky-800 leading-none">{mat.name}</span>
                        {!isExpanded && <span className="text-[7px] font-bold text-sky-400 uppercase tracking-widest">{MAT_TYPES[mat.type]} • R {mat.roughness.toFixed(2)}</span>}
                      </div>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="px-3 pb-3 border-t border-sky-50 space-y-3 pt-3 bg-sky-50/20">
                      <div className="grid grid-cols-2 gap-3">
                        <div><label className="text-[7px] font-black text-sky-400 uppercase">Material Name</label><input value={mat.name} onChange={e => updateMat({ name: e.target.value })} className="w-full text-[9px] font-bold text-sky-700 bg-white border border-sky-100 rounded px-1.5 py-1 outline-none shadow-sm" /></div>
                        <div><label className="text-[7px] font-black text-sky-400 uppercase">Surface Type</label><select value={mat.type} onChange={e => updateMat({ type: parseInt(e.target.value) })} className="w-full text-[9px] font-bold text-sky-700 bg-white border border-sky-100 rounded py-1 outline-none shadow-sm">{MAT_TYPES.map((t, i) => <option key={i} value={i}>{t}</option>)}</select></div>
                      </div>
                      <div className="flex gap-4 items-end">
                        <div className="flex-shrink-0"><label className="text-[7px] font-black text-sky-400 uppercase block mb-1">Color Picker</label><input type="color" value={RGBToHex(mat.color[0], mat.color[1], mat.color[2])} onChange={e => updateMat({ color: HexToRGB(e.target.value) })} className="w-10 h-10 rounded-lg border border-sky-100 cursor-pointer p-0.5 bg-white shadow-sm" /></div>
                        <div className="flex-1"><SliderSimple label="Roughness Factor" value={mat.roughness} min={0} max={1} step={0.01} onChange={(v:any) => updateMat({ roughness: v })} /></div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="p-3 bg-sky-50/50 border-t border-sky-100 flex items-center justify-between px-6 text-[7px] font-black text-sky-400 uppercase tracking-widest">
            <span>Declarative Path Tracer</span>
            <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 bg-green-400 rounded-full shadow-[0_0_5px_#4ade80] animate-pulse"></div>Live Sync</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
