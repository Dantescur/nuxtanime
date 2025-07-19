interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  originX: number;
  originY: number;
  originZ: number;
  color: [number, number, number, number];
  size: number;
}

export class WebGLLogoParticles {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private particles: Particle[] = [];
  private mouseX: number = -1000;
  private mouseY: number = -1000;
  private animationId: number = 0;
  private logoImage: HTMLImageElement;
  private isMouseOver: boolean = false;
  private vertexBuffer!: WebGLBuffer;
  private program!: WebGLProgram;
  private particleCount: number = 0;

  // Vertex shader for positioning and sizing particles
  private vertexShaderSource = `#version 300 es
    in vec3 position;
    in vec4 color;
    in float size;
    
    uniform mat4 projectionMatrix;
    uniform mat4 modelViewMatrix;
    
    out vec4 vColor;
    
    void main() {
      vColor = color;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = size; // Tweak size multiplier (e.g., * 1.5) for larger particles
    }
  `;

  // Fragment shader for circular particles with glow
  private fragmentShaderSource = `#version 300 es
    precision highp float;
    
    in vec4 vColor;
    out vec4 fragColor;
    
    void main() {
      vec2 coord = gl_PointCoord - vec2(0.5);
      float radius = dot(coord, coord);
      if (radius > 0.25) discard;
      
      // Adjust alpha multiplier (e.g., * 0.8) for stronger/weaker glow
      float alpha = vColor.a * (1.0 - radius * 4.0) * 0.8;
      fragColor = vec4(vColor.rgb, alpha);
    }
  `;

  constructor(canvas: HTMLCanvasElement, logoUrl: string) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2");
    if (!gl) throw new Error("WebGL2 not supported");
    this.gl = gl;

    this.logoImage = new Image();
    this.logoImage.src = logoUrl;
    this.logoImage.crossOrigin = "Anonymous";

    this.initWebGL();
    this.setupEventListeners();
  }

  private initWebGL(): void {
    const gl = this.gl;

    // Set fixed canvas size
    this.canvas.width = 350;
    this.canvas.height = 150;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

    // Initialize shaders and program
    const vertexShader = this.createShader(
      gl.VERTEX_SHADER,
      this.vertexShaderSource,
    );
    const fragmentShader = this.createShader(
      gl.FRAGMENT_SHADER,
      this.fragmentShaderSource,
    );
    this.program = this.createProgram(vertexShader, fragmentShader);
    gl.useProgram(this.program);

    // Create vertex buffer
    this.vertexBuffer = gl.createBuffer()!;

    // Enable blending for smooth particle rendering
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.clearColor(0.0, 0.0, 0.0, 0.0);

    // Load logo and start animation
    this.logoImage.onload = () => {
      this.createParticles();
      this.animate();
    };
  }

  // Compile a shader from source
  private createShader(type: number, source: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error("Shader compile error:", gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      throw new Error("Shader compilation failed");
    }
    return shader;
  }

  // Link vertex and fragment shaders into a program
  private createProgram(
    vertexShader: WebGLShader,
    fragmentShader: WebGLShader,
  ): WebGLProgram {
    const gl = this.gl;
    const program = gl.createProgram()!;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("Program link error:", gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      throw new Error("Program linking failed");
    }
    return program;
  }

  private setupEventListeners(): void {
    // Handle mouse movement relative to canvas
    const mouseMoveHandler = (e: MouseEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouseX = e.clientX - rect.left;
      this.mouseY = e.clientY - rect.top;
      this.isMouseOver = true;
    };

    // Reset mouse position when leaving canvas
    const mouseOutHandler = () => {
      this.isMouseOver = false;
      this.mouseX = -1000;
      this.mouseY = -1000;
    };

    this.canvas.addEventListener("mousemove", mouseMoveHandler);
    this.canvas.addEventListener("mouseout", mouseOutHandler);

    this._mouseMoveHandler = mouseMoveHandler;
    this._mouseOutHandler = mouseOutHandler;
  }

  private _mouseMoveHandler?: (e: MouseEvent) => void;
  private _mouseOutHandler?: () => void;

  // Generate particles based on logo image
  private createParticles(): void {
    // const gl = this.gl;
    this.particles = [];

    const tempCanvas = document.createElement("canvas");
    const tempCtx = tempCanvas.getContext("2d");
    if (!tempCtx) return;

    // Scale logo to fit 90% of 350x150 canvas
    const scale = Math.min(
      (this.canvas.width * 0.9) / this.logoImage.width,
      (this.canvas.height * 0.9) / this.logoImage.height,
    );

    const logoWidth = this.logoImage.width * scale;
    const logoHeight = this.logoImage.height * scale;

    tempCanvas.width = logoWidth;
    tempCanvas.height = logoHeight;
    tempCtx.drawImage(this.logoImage, 0, 0, logoWidth, logoHeight);

    const imageData = tempCtx.getImageData(0, 0, logoWidth, logoHeight);
    const pixelData = imageData.data;

    // Center logo on canvas
    const offsetX = (this.canvas.width - logoWidth) / 2;
    const offsetY = (this.canvas.height - logoHeight) / 2;

    // Adjust particle density (higher gap = fewer particles)
    const particleGap = 1;

    for (let y = 0; y < logoHeight; y += particleGap) {
      for (let x = 0; x < logoWidth; x += particleGap) {
        const pixelIndex = (y * logoWidth + x) * 4;
        const alpha = pixelData[pixelIndex + 3];

        if (alpha > 128) {
          const red = pixelData[pixelIndex] / 255;
          const green = pixelData[pixelIndex + 1] / 255;
          const blue = pixelData[pixelIndex + 2] / 255;

          // Add slight depth variation (tweak range for more/less 3D effect)
          const z = (Math.random() * 2 - 1) * 20;

          this.particles.push({
            x: offsetX + x, // Start at origin for smooth initial animation
            y: offsetY + y,
            z: z,
            vx: 0,
            vy: 0,
            vz: 0,
            originX: offsetX + x,
            originY: offsetY + y,
            originZ: 0,
            color: [red, green, blue, 1.0],
            size: Math.random() * 1.5 + 0.9, // Tweak range for particle size
          });
        }
      }
    }

    this.particleCount = this.particles.length;
    this.updateVertexBuffer();
  }

  // Update vertex buffer with particle data
  private updateVertexBuffer(): void {
    const gl = this.gl;
    const vertexData = new Float32Array(this.particleCount * 8);

    for (let i = 0; i < this.particleCount; i++) {
      const p = this.particles[i];
      const offset = i * 8;
      vertexData[offset] = p.x;
      vertexData[offset + 1] = p.y;
      vertexData[offset + 2] = p.z;
      vertexData[offset + 3] = p.color[0];
      vertexData[offset + 4] = p.color[1];
      vertexData[offset + 5] = p.color[2];
      vertexData[offset + 6] = p.color[3];
      vertexData[offset + 7] = p.size;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.DYNAMIC_DRAW);
  }

  private animate(): void {
    const gl = this.gl;

    // Clear canvas
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const attractionForce = 0.06; // Higher = faster return to origin
    const mouseRepelForce = 4; // Higher = stronger mouse repulsion
    const mouseRadius = 120; // Interaction radius (smaller for 350x150 canvas)
    const friction = 0.92; // Higher = smoother motion
    const mouseRadiusSquared = mouseRadius * mouseRadius; // Cached for performance

    // Update particle positions
    for (let i = 0; i < this.particleCount; i++) {
      const p = this.particles[i];

      // Attraction to origin
      const dx = p.originX - p.x;
      const dy = p.originY - p.y;
      const dz = p.originZ - p.z;
      p.vx += dx * attractionForce;
      p.vy += dy * attractionForce;
      p.vz += dz * attractionForce * 0.5;

      // Mouse interaction
      if (this.isMouseOver) {
        const mouseDx = p.x - this.mouseX;
        const mouseDy = p.y - this.mouseY;
        const mouseDistSquared = mouseDx * mouseDx + mouseDy * mouseDy;

        if (mouseDistSquared < mouseRadiusSquared) {
          const mouseDist = Math.sqrt(mouseDistSquared);
          const force = (mouseRadius - mouseDist) / mouseRadius;
          // Avoid division by zero
          p.vx += (mouseDx / (mouseDist + 0.1)) * force * mouseRepelForce;
          p.vy += (mouseDy / (mouseDist + 0.1)) * force * mouseRepelForce;
          p.vz += force * mouseRepelForce * 0.5;
        }
      }

      // Apply friction
      p.vx *= friction;
      p.vy *= friction;
      p.vz *= friction;

      // Update position
      p.x += p.vx;
      p.y += p.vy;
      p.z += p.vz;
    }

    // Update vertex buffer
    this.updateVertexBuffer();

    // Set up attribute pointers
    const positionLoc = gl.getAttribLocation(this.program, "position");
    const colorLoc = gl.getAttribLocation(this.program, "color");
    const sizeLoc = gl.getAttribLocation(this.program, "size");

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 3, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(colorLoc);
    gl.vertexAttribPointer(colorLoc, 4, gl.FLOAT, false, 32, 12);
    gl.enableVertexAttribArray(sizeLoc);
    gl.vertexAttribPointer(sizeLoc, 1, gl.FLOAT, false, 32, 28);

    // Set projection and model-view matrices
    gl.uniformMatrix4fv(
      gl.getUniformLocation(this.program, "projectionMatrix"),
      false,
      this.getProjectionMatrix(),
    );
    gl.uniformMatrix4fv(
      gl.getUniformLocation(this.program, "modelViewMatrix"),
      false,
      this.getModelViewMatrix(),
    );

    // Draw particles
    gl.drawArrays(gl.POINTS, 0, this.particleCount);

    this.animationId = requestAnimationFrame(() => this.animate());
  }

  // Orthographic projection for 2D-like rendering
  private getProjectionMatrix(): Float32Array {
    const left = 0;
    const right = this.canvas.width;
    const bottom = this.canvas.height;
    const top = 0;
    const near = -1000;
    const far = 1000;

    return new Float32Array([
      2 / (right - left),
      0,
      0,
      0,
      0,
      2 / (top - bottom),
      0,
      0,
      0,
      0,
      2 / (near - far),
      0,
      -(right + left) / (right - left),
      -(top + bottom) / (top - bottom),
      -(far + near) / (far - near),
      1,
    ]);
  }

  // Model-view matrix with slight perspective
  private getModelViewMatrix(): Float32Array {
    // Tweak -0.001 for more/less depth effect
    return new Float32Array([
      1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, -0.001, 0, 0, 0, 1,
    ]);
  }

  // Clean up resources
  public destroy(): void {
    cancelAnimationFrame(this.animationId);
    this.gl.deleteProgram(this.program);
    this.gl.deleteBuffer(this.vertexBuffer);

    if (this._mouseMoveHandler) {
      this.canvas.removeEventListener("mousemove", this._mouseMoveHandler);
    }
    if (this._mouseOutHandler) {
      this.canvas.removeEventListener("mouseout", this._mouseOutHandler);
    }
  }
}
