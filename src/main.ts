import "./style.css";
import nuxtVercel from "./nuxt-x-vercel.svg";
import { WebGLLogoParticles } from "./webglanim";

const canvas = document.getElementById("particle-canvas") as HTMLCanvasElement;
if (canvas) {
  const particles = new WebGLLogoParticles(canvas, nuxtVercel);
}
