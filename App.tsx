
import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { ShaderCanvas, ShaderCanvasHandle } from './components/ShaderCanvas';

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
  isEnd: boolean;
  isOut: boolean;
}

interface Material {
  id: number;
  name: string;
  color: [number, number, number];
  type: number; // 0:LAMBERTIAN, 1:METAL, 2:DIELECTRIC
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
const MAT_TYPES = ["LAMB", "METAL", "DIEL"];
const PI = Math.PI;

const createDefaultGeom = (matId = 0): Geometry => ({
  type: 0, pos: [0, 0, 0], size: [1, 1, 1], axis: [0, 1, 0], angle: 0, matId
});

const initialScene: Scene = {
  name: "New Scene",
  materials: [
    { id: 0, name: "Gold", color: [1.0, 0.8, 0.4], type: 1, roughness: 0.1 },
    { id: 1, name: "White", color: [0.9, 0.9, 0.9], type: 0, roughness: 0.8 },
  ],
  logic: [
    {
      id: "root-1", name: "Scene Root", type: 6, geometry: createDefaultGeom(0),
      isEnd: false, isOut: false,
      children: [
        { id: "floor-1", name: "Ground", type: 0, geometry: { ...createDefaultGeom(1), pos: [0, -1, 0], size: [10, 0.1, 10] }, isEnd: false, isOut: true }
      ]
    }
  ]
};

// --- APP ---

const App: React.FC = () => {
  const [scene, setScene] = useState<Scene>(initialScene);
  const [activeTab, setActiveTab] = useState<'logic' | 'materials'>('logic');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showData, setShowData] = useState(true);
  const [draggedPath, setDraggedPath] = useState<number[] | null>(null);
  
  const shaderRef = useRef<ShaderCanvasHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- HELPERS ---

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

  const syncToGPU = useCallback(() => {
    const buffer = new Float32Array(34 * 6 * 4);
    const flatShapes: Geometry[] = [];
    const flatOps: any[] = [];

    const processNode = (node: OpNode) => {
      let shapeIdx = -1;
      if (node.geometry) {
        shapeIdx = flatShapes.length;
        flatShapes.push(node.geometry);
      }
      const opEntry = { type: node.type, shapeIdx, jumpTo: 0, isEnd: node.isEnd ? 1 : 0, isOut: node.isOut ? 1 : 0 };
      flatOps.push(opEntry);
      
      if (node.type === 6) {
        if (node.children) {
          node.children.forEach(processNode);
        }
        opEntry.jumpTo = flatOps.length;
      }
    };

    scene.logic.forEach(processNode);

    flatShapes.slice(0, 34).forEach((s, i) => {
      buffer.set([s.pos[0], s.pos[1], s.pos[2], s.type], (0 * 34 + i) * 4);
      buffer.set([s.size[0], s.size[1], s.size[2], s.matId], (1 * 34 + i) * 4);
      buffer.set([s.axis[0], s.axis[1], s.axis[2], s.angle], (2 * 34 + i) * 4);
    });

    flatOps.slice(0, 34).forEach((op, i) => {
      const idx = (3 * 34 + i) * 4;
      if (op.type === 6) {
        const safeJump = Math.min(op.jumpTo, 34);
        buffer.set([6, op.shapeIdx, safeJump, op.isEnd], idx);
      }
      else buffer.set([op.type, op.shapeIdx, op.isEnd, op.isOut], idx);
    });

    scene.materials.slice(0, 8).forEach((m, i) => {
      buffer.set([m.color[0], m.color[1], m.color[2], m.type + m.roughness], (4 * 34 + i) * 4);
    });

    buffer[(5 * 34 + 0) * 4] = 1.0; 
    shaderRef.current?.updateBufferData(buffer);
  }, [scene]);

  useEffect(() => {
    syncToGPU();
  }, [syncToGPU, showData]);

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
      setExpandedId(clone.id);
    }
  };

  const handleDragStart = (path: number[]) => setDraggedPath(path);
  
  const isAncestor = (path: number[], target: number[]) => {
    if (path.length >= target.length) return false;
    return path.every((v, i) => v === target[i]);
  };

  const handleDrop = (targetPath: number[], asChild = false) => {
    if (!draggedPath) return;
    if (isAncestor(draggedPath, targetPath) || JSON.stringify(draggedPath) === JSON.stringify(targetPath)) {
      setDraggedPath(null);
      return;
    }
    const newScene = JSON.parse(JSON.stringify(scene));
    let sourceList = getListAtPath(newScene.logic, draggedPath);
    if (!sourceList || sourceList.length <= draggedPath[draggedPath.length - 1]) {
      setDraggedPath(null);
      return;
    }
    const [node] = sourceList.splice(draggedPath[draggedPath.length - 1], 1);
    let actualTargetPath = [...targetPath];
    const samePrefix = draggedPath.length === targetPath.length && draggedPath.slice(0, -1).every((v, i) => v === targetPath[i]);
    if (samePrefix) {
      if (draggedPath[draggedPath.length - 1] < targetPath[targetPath.length - 1]) {
        actualTargetPath[actualTargetPath.length - 1]--;
      }
    }

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
      if (destList) {
        destList.splice(actualTargetPath[actualTargetPath.length - 1], 0, node);
      }
    }
    setScene(newScene);
    setDraggedPath(null);
  };

  const SliderWithButtons = ({ label, value, min, max, step = 0.5, onChange }: any) => (
    <div className="flex flex-col gap-0.5 group w-full overflow-hidden">
      <div className="flex justify-between text-[7px] uppercase font-black text-sky-400 px-0.5">
        <span>{label}</span>
        <span className="text-sky-600 font-mono">{Number(value).toFixed(2)}</span>
      </div>
      <div className="flex items-center gap-1 w-full">
        <button onClick={() => onChange(parseFloat((value - step).toFixed(2)))} className="w-5 h-4 flex-shrink-0 flex items-center justify-center bg-sky-50 text-sky-600 border border-sky-100 rounded hover:bg-sky-500 hover:text-white transition-colors text-[10px] font-bold">-</button>
        <div className="flex-1 relative h-4 flex items-center">
          <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} className="w-full h-1 bg-sky-100 rounded-lg appearance-none cursor-pointer accent-sky-500 m-0" />
        </div>
        <button onClick={() => onChange(parseFloat((value + step).toFixed(2)))} className="w-5 h-4 flex-shrink-0 flex items-center justify-center bg-sky-50 text-sky-600 border border-sky-100 rounded hover:bg-sky-500 hover:text-white transition-colors text-[10px] font-bold">+</button>
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
      <div 
        key={node.id} 
        onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
        onDrop={e => { e.stopPropagation(); handleDrop(path, false); }}
        className="mb-1"
      >
        <div className={`border rounded-lg transition-all shadow-sm overflow-hidden ${node.isOut ? 'bg-emerald-50 border-emerald-300 ring-1 ring-emerald-200' : isExpanded ? 'bg-sky-50 border-sky-300' : 'bg-white border-sky-100'}`}>
          <div draggable onDragStart={(e) => { e.stopPropagation(); handleDragStart(path); }} className="flex items-center px-2 py-1.5 gap-2 cursor-grab active:cursor-grabbing hover:bg-sky-50/50">
            <div onClick={() => setExpandedId(isExpanded ? null : node.id)} className="flex-1 cursor-pointer flex items-center justify-between overflow-hidden">
              <div className="flex items-center gap-2 overflow-hidden">
                <div className={`w-1.5 h-1.5 flex-shrink-0 rounded-full ${isAABB ? 'bg-amber-400' : 'bg-sky-400'}`}></div>
                <div className="flex items-baseline gap-2 overflow-hidden">
                  <span className="text-[10px] font-black text-sky-800 leading-none truncate">{node.name}</span>
                  {!isExpanded && <span className="text-[7px] font-bold text-sky-400 uppercase tracking-tighter truncate opacity-80">{OP_TYPES[node.type]} • {SHAPE_TYPES[node.geometry?.type || 0]}</span>}
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button onClick={(e) => { e.stopPropagation(); duplicateNode(path); }} className="text-sky-300 hover:text-sky-600 transition-colors">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg>
              </button>
              {!node.children?.length && (
                <button onClick={(e) => { e.stopPropagation(); deleteNode(path); }} className="text-rose-200 hover:text-rose-500 transition-colors">
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
                  <input type="text" value={node.name} onChange={e => updateNode({ name: e.target.value })} className="w-full bg-white border border-sky-100 rounded px-1.5 py-0.5 text-[9px] font-bold text-sky-700 outline-none" />
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
                      <SliderWithButtons label="Pos X" value={node.geometry.pos[0]} min={-20} max={20} onChange={(v:any) => updateNode({ geometry: { ...node.geometry!, pos: [v, node.geometry!.pos[1], node.geometry!.pos[2]] } })} />
                      <SliderWithButtons label="Pos Y" value={node.geometry.pos[1]} min={-20} max={20} onChange={(v:any) => updateNode({ geometry: { ...node.geometry!, pos: [node.geometry!.pos[0], v, node.geometry!.pos[2]] } })} />
                      <SliderWithButtons label="Pos Z" value={node.geometry.pos[2]} min={-20} max={20} onChange={(v:any) => updateNode({ geometry: { ...node.geometry!, pos: [node.geometry!.pos[0], node.geometry!.pos[1], v] } })} />
                    </div>
                    <div className="space-y-2">
                      <SliderWithButtons label="Size W" value={node.geometry.size[0]} min={0.01} max={20} onChange={(v:any) => updateNode({ geometry: { ...node.geometry!, size: [v, node.geometry!.size[1], node.geometry!.size[2]] } })} />
                      <SliderWithButtons label="Size H" value={node.geometry.size[1]} min={0.01} max={20} onChange={(v:any) => updateNode({ geometry: { ...node.geometry!, size: [node.geometry!.size[0], v, node.geometry!.size[2]] } })} />
                      <SliderWithButtons label="Size D" value={node.geometry.size[2]} min={0.01} max={20} onChange={(v:any) => updateNode({ geometry: { ...node.geometry!, size: [node.geometry!.size[0], node.geometry!.size[1], v] } })} />
                    </div>
                  </div>
                  
                  <div className="bg-sky-50/50 p-2 rounded space-y-2">
                    <div className="flex items-center justify-between">
                       <span className="text-[7px] font-black text-sky-400 uppercase">Rotation</span>
                       <select className="text-[8px] font-bold text-sky-700 bg-white border border-sky-100 rounded px-1" value={node.geometry.axis.join(',')} onChange={e => updateNode({ geometry: { ...node.geometry!, axis: e.target.value.split(',').map(Number) as [number, number, number] } })}>
                          <option value="1,0,0">X Axis</option>
                          <option value="0,1,0">Y Axis</option>
                          <option value="0,0,1">Z Axis</option>
                        </select>
                    </div>
                    <SliderSimple label="Angle (Snap 45°)" value={node.geometry.angle} min={-PI} max={PI} step={PI / 4} onChange={(v:any) => updateNode({ geometry: { ...node.geometry!, angle: v } })} />
                  </div>
                </div>
              )}

              <div className="flex gap-4 px-1 pt-1 border-t border-sky-100/50">
                <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={node.isEnd} onChange={e => updateNode({ isEnd: e.target.checked })} className="w-3 h-3 accent-sky-500 rounded" /><span className="text-[7px] font-black text-sky-400 uppercase">Terminal Node</span></label>
                {!isAABB && <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={node.isOut} onChange={e => updateNode({ isOut: e.target.checked })} className="w-3 h-3 accent-sky-500 rounded" /><span className="text-[7px] font-black text-sky-400 uppercase">Visible Output</span></label>}
              </div>

              {isAABB && (
                <button onClick={() => updateNode({ children: [...(node.children || []), { id: Math.random().toString(), name: "New Op", type: 0, geometry: createDefaultGeom(node.geometry?.matId || 0), isEnd: false, isOut: true }] })} className="w-full py-1 bg-sky-100 text-sky-600 text-[8px] font-black uppercase rounded hover:bg-sky-500 hover:text-white transition-all">+ Add Child</button>
              )}
            </div>
          )}
        </div>
        {isAABB && node.children && (
          <div className="ml-2 pl-2 border-l border-sky-100 mt-1">
            {node.children.map((child, idx) => renderLogicNode(child, [...path, idx]))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex w-screen h-screen bg-sky-100 overflow-hidden font-sans">
      <div className="flex-1 relative">
        <ShaderCanvas ref={shaderRef} />
        <div className="absolute top-4 left-4 z-20 flex gap-2">
          <button onClick={syncToGPU} className="px-5 h-10 bg-sky-500 text-white font-black uppercase tracking-widest text-xs rounded-xl shadow-lg hover:bg-sky-600 transition-all active:scale-95 flex items-center gap-2">Force Sync</button>
          <button onClick={() => { setShowData(!showData); syncToGPU(); }} className={`w-10 h-10 bg-white/90 border border-sky-100 rounded-xl shadow flex items-center justify-center text-sky-500 ${showData ? 'ring-2 ring-sky-400' : ''}`}>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" /></svg>
          </button>
        </div>
      </div>

      <div className="h-full bg-white/95 border-l border-sky-50 shadow-2xl transition-all duration-300 flex flex-col" style={{ width: showData ? '360px' : '0px' }}>
        <div className="w-[360px] flex-shrink-0 flex flex-col h-full overflow-hidden">
          <div className="p-4 flex flex-col gap-3">
            <div className="flex justify-between items-center gap-2">
              <input 
                type="text" 
                value={scene.name} 
                onChange={e => setScene(prev => ({ ...prev, name: e.target.value }))}
                className="flex-1 text-xl font-black text-sky-800 tracking-tighter uppercase bg-transparent border-b-2 border-transparent hover:border-sky-100 focus:border-sky-400 outline-none truncate pb-0.5"
                placeholder="Scene Name"
              />
              <div className="flex gap-2 flex-shrink-0">
                 <button onClick={() => { 
                   const a = document.createElement('a'); 
                   const json = JSON.stringify(scene, null, 2); 
                   a.href = URL.createObjectURL(new Blob([json], {type: 'application/json'})); 
                   a.download = `${scene.name.toLowerCase().replace(/\s+/g, '-')}.json`; 
                   a.click(); 
                 }} className="text-[8px] font-black uppercase text-sky-400 hover:text-sky-600 transition-colors">Export</button>
                 <button onClick={() => fileInputRef.current?.click()} className="text-[8px] font-black uppercase text-sky-400 hover:text-sky-600 transition-colors">Import</button>
                 <input ref={fileInputRef} type="file" className="hidden" onChange={e => { 
                   const f = e.target.files?.[0]; 
                   if(f) { 
                     const r = new FileReader(); 
                     r.onload = ev => { 
                       try { 
                         const data = JSON.parse(ev.target?.result as string); 
                         if (data && data.logic && data.materials) {
                           // Fallback se il file non ha un nome (vecchi export)
                           if (!data.name) data.name = f.name.replace('.json', '');
                           setScene(data); 
                         }
                       } catch(err) { alert("Invalid JSON file"); } 
                     }; 
                     r.readAsText(f); 
                   } 
                 }} />
              </div>
            </div>

            <div className="flex bg-sky-50 p-1 rounded-xl border border-sky-100">
              <button onClick={() => setActiveTab('logic')} className={`flex-1 py-1.5 text-[9px] font-black uppercase rounded-lg transition-all ${activeTab === 'logic' ? 'bg-white text-sky-600 shadow-sm' : 'text-sky-400'}`}>Logic Hierarchy</button>
              <button onClick={() => setActiveTab('materials')} className={`flex-1 py-1.5 text-[9px] font-black uppercase rounded-lg transition-all ${activeTab === 'materials' ? 'bg-white text-sky-600 shadow-sm' : 'text-sky-400'}`}>Materials</button>
            </div>

            {activeTab === 'logic' && (
              <button onClick={() => setScene(p => ({ ...p, logic: [...p.logic, { id: Math.random().toString(), name: "Root Op", type: 0, geometry: createDefaultGeom(0), isEnd: false, isOut: true }] }))} className="w-full py-2 bg-sky-500 text-white text-[9px] font-black uppercase rounded-lg shadow-md hover:bg-sky-600 transition-all">+ Add Root Operation</button>
            )}
            {activeTab === 'materials' && (
              <button onClick={() => setScene(p => ({ ...p, materials: [...p.materials, { id: p.materials.length, name: "New Mat", color: [0.5, 0.5, 0.5], type: 0, roughness: 0.5 }] }))} className="w-full py-2 bg-sky-500 text-white text-[9px] font-black uppercase rounded-lg shadow-md hover:bg-sky-600 transition-all">+ Add Material</button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2 select-none" onMouseDown={e => e.stopPropagation()}>
            {activeTab === 'logic' && scene.logic.map((node, i) => renderLogicNode(node, [i]))}
            {activeTab === 'materials' && scene.materials.map((mat, i) => {
              const isUsed = usedMaterialIds.has(mat.id);
              const isExpanded = expandedId === `mat-${mat.id}`;
              const updateMat = (fields: Partial<Material>) => { const next = JSON.parse(JSON.stringify(scene)); next.materials[i] = { ...next.materials[i], ...fields }; setScene(next); };
              return (
                <div key={i} className={`border rounded-lg bg-white transition-all border-sky-100 shadow-sm ${!isUsed ? 'opacity-40 grayscale' : 'hover:border-sky-300'}`}>
                  <div className="p-2.5 flex items-center justify-between cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : `mat-${mat.id}`)}>
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
                        <div>
                          <label className="text-[7px] font-black text-sky-400 uppercase">Material Name</label>
                          <input value={mat.name} onChange={e => updateMat({ name: e.target.value })} className="w-full text-[9px] font-bold text-sky-700 bg-white border border-sky-100 rounded px-1.5 py-1 outline-none shadow-sm" />
                        </div>
                        <div>
                          <label className="text-[7px] font-black text-sky-400 uppercase">Surface Type</label>
                          <select value={mat.type} onChange={e => updateMat({ type: parseInt(e.target.value) })} className="w-full text-[9px] font-bold text-sky-700 bg-white border border-sky-100 rounded py-1 outline-none shadow-sm">
                            {MAT_TYPES.map((t, i) => <option key={i} value={i}>{t}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="flex gap-4 items-end">
                        <div className="flex-shrink-0">
                          <label className="text-[7px] font-black text-sky-400 uppercase block mb-1">Color Picker</label>
                          <input type="color" value={RGBToHex(mat.color[0], mat.color[1], mat.color[2])} onChange={e => updateMat({ color: HexToRGB(e.target.value) })} className="w-10 h-10 rounded-lg border border-sky-100 cursor-pointer p-0.5 bg-white shadow-sm" />
                        </div>
                        <div className="flex-1">
                          <SliderSimple label="Roughness Factor" value={mat.roughness} min={0} max={1} step={0.01} onChange={(v:any) => updateMat({ roughness: v })} />
                        </div>
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
