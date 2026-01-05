import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { bufferAShader, mainShader, displayShader } from '../constants/shaders';
import { MAX_OPS } from '../constants/config';

export interface ShaderCanvasHandle {
  getBufferData: () => Float32Array | null;
  updateBufferData: (data: Float32Array) => void;
}

export const ShaderCanvas = forwardRef<ShaderCanvasHandle>((props, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number>(0);
  const mouseRef = useRef({ x: 0, y: 0, z: 0, w: 0, clicking: false });
  const keysRef = useRef<Set<number>>(new Set());
  const frameRef = useRef(0);
  const startTimeRef = useRef(performance.now());
  
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const texturesARef = useRef<WebGLTexture[]>([]);
  const framebuffersARef = useRef<WebGLFramebuffer[]>([]);
  const texturesMainRef = useRef<WebGLTexture[]>([]);
  const framebuffersMainRef = useRef<WebGLFramebuffer[]>([]);

  useImperativeHandle(ref, () => ({
    getBufferData: () => {
      const gl = glRef.current;
      if (!gl || framebuffersARef.current.length === 0) return null;
      
      const width = MAX_OPS; 
      const height = 6; 
      const data = new Float32Array(width * height * 4);
      
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffersARef.current[frameRef.current % 2]);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, data);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      
      return data;
    },
    updateBufferData: (data: Float32Array) => {
      const gl = glRef.current;
      if (!gl || texturesARef.current.length === 0) return;
      
      const width = MAX_OPS;
      const row5Offset = 5 * width * 4;
      
      for (let i = 0; i < 2; i++) {
        gl.bindTexture(gl.TEXTURE_2D, texturesARef.current[i]);
        
        // Update rows 0-4: Shapes, Ops, and Materials
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, 5, gl.RGBA, gl.FLOAT, data.subarray(0, width * 5 * 4));
        
        // Selectively update row 5 to avoid overwriting camera state (x=1, x=2)
        // Update p.x=0 (Reset flag)
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 5, 1, 1, gl.RGBA, gl.FLOAT, data.subarray(row5Offset, row5Offset + 4));
        
        // Update p.x=3 (Fast Render flag)
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 3, 5, 1, 1, gl.RGBA, gl.FLOAT, data.subarray(row5Offset + 12, row5Offset + 16));
      }
      gl.bindTexture(gl.TEXTURE_2D, null);
    }
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl2', { 
      preserveDrawingBuffer: true,
      antialias: false,
      alpha: true,
      depth: false,
      stencil: false
    });
    if (!gl) {
      alert("WebGL 2.0 not supported");
      return;
    }
    glRef.current = gl;

    gl.getExtension('EXT_color_buffer_float');

    const createShader = (type: number, source: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, source);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(s));
        gl.deleteShader(s);
        return null;
      }
      return s;
    };

    const createProgram = (vs: string, fs: string) => {
      const v = createShader(gl.VERTEX_SHADER, vs)!;
      const f = createShader(gl.FRAGMENT_SHADER, fs)!;
      const p = gl.createProgram()!;
      gl.attachShader(p, v);
      gl.attachShader(p, f);
      gl.linkProgram(p);
      return p;
    };

    const createTexture = (w: number, h: number) => {
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return tex;
    };

    const createFramebuffer = (tex: WebGLTexture) => {
      const fb = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      return fb;
    };

    const vsSource = `#version 300 es
      layout(location = 0) in vec2 position;
      void main() { gl_Position = vec4(position, 0.0, 1.0); }
    `;

    const progA = createProgram(vsSource, bufferAShader);
    const progMain = createProgram(vsSource, mainShader);
    const progDisplay = createProgram(vsSource, displayShader);

    const quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    // Initial sizing
    canvas.width = canvas.clientWidth || window.innerWidth;
    canvas.height = canvas.clientHeight || window.innerHeight;

    texturesARef.current = [createTexture(canvas.width, canvas.height), createTexture(canvas.width, canvas.height)];
    framebuffersARef.current = [createFramebuffer(texturesARef.current[0]), createFramebuffer(texturesARef.current[1])];
    
    texturesMainRef.current = [createTexture(canvas.width, canvas.height), createTexture(canvas.width, canvas.height)];
    framebuffersMainRef.current = [createFramebuffer(texturesMainRef.current[0]), createFramebuffer(texturesMainRef.current[1])];

    const keyTexture = gl.createTexture();
    const keyData = new Uint8Array(256);

    const updateKeyTexture = () => {
      keyData.fill(0);
      keysRef.current.forEach(k => { if(k < 256) keyData[k] = 255; });
      gl.bindTexture(gl.TEXTURE_2D, keyTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 256, 1, 0, gl.RED, gl.UNSIGNED_BYTE, keyData);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    };

    const setUniforms = (prog: WebGLProgram) => {
      gl.useProgram(prog);
      gl.uniform3f(gl.getUniformLocation(prog, 'iResolution'), canvas.width, canvas.height, 1.0);
      gl.uniform1f(gl.getUniformLocation(prog, 'iTime'), (performance.now() - startTimeRef.current) / 1000);
      gl.uniform1i(gl.getUniformLocation(prog, 'iFrame'), frameRef.current);
      gl.uniform4f(gl.getUniformLocation(prog, 'iMouse'), mouseRef.current.x, mouseRef.current.y, mouseRef.current.z, mouseRef.current.w);

      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    };

    const render = () => {
      const gl = glRef.current;
      if (!gl) return;
      const width = canvas.width;
      const height = canvas.height;

      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffersARef.current[frameRef.current % 2]);
      gl.viewport(0, 0, width, height);
      setUniforms(progA);
      updateKeyTexture();
      
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texturesARef.current[(frameRef.current + 1) % 2]);
      gl.uniform1i(gl.getUniformLocation(progA, 'iChannel0'), 0);
      
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, keyTexture);
      gl.uniform1i(gl.getUniformLocation(progA, 'iChannel3'), 3);
      
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffersMainRef.current[frameRef.current % 2]);
      setUniforms(progMain);
      
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texturesARef.current[frameRef.current % 2]);
      gl.uniform1i(gl.getUniformLocation(progMain, 'iChannel0'), 0);
      
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, texturesMainRef.current[(frameRef.current + 1) % 2]);
      gl.uniform1i(gl.getUniformLocation(progMain, 'iChannel1'), 1);
      
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, width, height);
      setUniforms(progDisplay);
      
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, texturesMainRef.current[frameRef.current % 2]);
      gl.uniform1i(gl.getUniformLocation(progDisplay, 'iChannel1'), 1);
      
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      frameRef.current++;
      requestRef.current = requestAnimationFrame(render);
    };

    const handleResize = () => {
      if (!canvas) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) return;
      
      canvas.width = w;
      canvas.height = h;
      
      for (let i = 0; i < 2; i++) {
        gl.bindTexture(gl.TEXTURE_2D, texturesARef.current[i]); 
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, null);
        gl.bindTexture(gl.TEXTURE_2D, texturesMainRef.current[i]); 
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, null);
      }
      frameRef.current = 0; 
    };

    // Use ResizeObserver for accurate sizing when sidebar moves
    const resizeObserver = new ResizeObserver(() => handleResize());
    if (canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    }

    const onMouseDown = (e: MouseEvent) => {
      mouseRef.current.clicking = true;
      mouseRef.current.x = e.clientX;
      mouseRef.current.y = canvas.height - e.clientY;
      mouseRef.current.z = mouseRef.current.x;
      mouseRef.current.w = mouseRef.current.y;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!mouseRef.current.clicking) return;
      mouseRef.current.x = e.clientX;
      mouseRef.current.y = canvas.height - e.clientY;
    };
    const onMouseUp = () => {
      mouseRef.current.clicking = false;
      mouseRef.current.z = -Math.abs(mouseRef.current.z);
      mouseRef.current.w = -Math.abs(mouseRef.current.w);
    };
    const onKeyDown = (e: KeyboardEvent) => keysRef.current.add(e.keyCode);
    const onKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.keyCode);

    // Mouse down listener only on canvas to avoid interaction with UI sidebar
    canvas.addEventListener('mousedown', onMouseDown);
    // Mouse move and up remain on window to ensure smooth tracking even if mouse leaves canvas while dragging
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    requestRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(requestRef.current);
      resizeObserver.disconnect();
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full">
      <canvas 
        ref={canvasRef} 
        className="block w-full h-full cursor-crosshair"
      />
    </div>
  );
});
