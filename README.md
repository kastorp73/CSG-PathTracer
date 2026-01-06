# Declarative CSG Path Tracer

An advanced WebGL2 wrapper for a **Path Tracing** rendering engine based on declarative **CSG (Constructive Solid Geometry)** logic. The application allows building complex scenes by combining geometric primitives through boolean operations, featuring physically based materials (PBR) and high-fidelity progressive rendering.

> **Technical Note**: The core rendering engine used in this project is based on my  [CSG Path Tracer](https://www.shadertoy.com/view/tcGfW1) shader on Shadertoy.

## 🚀 Live Demo
[View Live Demo on GitHub Pages](https://raw.githack.com/kastorp73/CSG-PathTracer/main/CSG.html)

---

## 🎮 Commands and Controls

### 🎥 Camera Movement
The editor uses a real-time navigation system integrated into the GPU state buffer:
- **WASD**: Horizontal camera movement (forward, left, backward, right).
- **Q / E**: Height adjustment / Zoom (move closer or further from the viewpoint).
- **Mouse Drag (Left Click)**: Orbit the view around the target.
- **Spacebar**: Instant reset of persistence buffers (clears noise if the scene changes drastically).

### 🛠️ Editor Interface
- **Logic Hierarchy**: Manage the operation tree structure. You can drag and drop nodes to change the CSG hierarchy.
- **Materials**: Edit colors, roughness, and surface types (Lambertian, Metal, Dielectric, Emissive).
- **Force Sync**: Force the immediate upload of the entire scene to GPU memory.
- **Fast Rendering**: Enables a quick preview mode that disables multi-bounce path tracing in favor of smoother direct lighting during editing.
- **Show/Hide Data**: Hides the sidebar for a full-screen view.

---

## 🏗️ CSG Modeling Guide
The engine supports the following logical operations:
1. **ADD / UNION**: Merges two volumes into one.
2. **SUB (Subtraction)**: Subtracts the secondary shape from the first (creates holes or cavities).
3. **INTER (Intersection)**: Keeps only the overlapping area between two shapes.
4. **AABB (Bounding Box)**: A special node that optimizes performance. If the ray doesn't hit the containment box, it ignores all contained children, allowing for scenes with hundreds of objects.

---

## 🗺️ Development Roadmap
- [x] Integration of **EMISSIVE** materials (self-lighting).
- [x] **Drag & Drop** system for the node hierarchy.
- [x] Export/Import in **JSON** format.
- [x] Export model to **Shadertoy**.
- [x] **Optimization** of the progressive rendering loop.
- [ ] Support for **texture** mapping and normal maps on materials
- [ ] **More Shapes**: Support for irregular prisms, triangles, 2d extrusions.
- [ ] **Shape Repetition**: Implementation of shape repetition over an axis or radial. 
- [ ] **AABB Reference**: use a reference  of an AABB cblock, with translation/rotation/scaling
- [ ] **Highlight** of the selected shape while editing. 
- [ ] **More Shortkeys** for editing operations
- [ ] **Spatial Denoiser**: Implementation of a filter to reduce the "noise" typical of path tracing during movement.
- [ ] **Prompt-to-CSG**: Integration with Gemini API to generate object hierarchies from text descriptions.

## 📄 License
This project is released under the MIT license. Developed with passion for computer graphics and geometry.

*Based on original work by Kastorp.*