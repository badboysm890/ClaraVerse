import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { Brain, Sparkles, MessageCircle } from 'lucide-react';

interface TypingIndicatorProps {
  isVisible: boolean;
  message?: string;
}

const TypingIndicator: React.FC<TypingIndicatorProps> = ({ 
  isVisible, 
  message = "angela is thinking..."
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const dotsRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isVisible || !containerRef.current) return;

    const tl = gsap.timeline();

    // Set initial states
    gsap.set(containerRef.current, { opacity: 0, scale: 0.9, y: 10 });
    gsap.set(iconRef.current, { scale: 0, rotation: -90 });
    gsap.set(textRef.current, { opacity: 0, x: -10 });
    gsap.set(".typing-dot", { scale: 0 });

    // Entrance animation
    tl.to(containerRef.current, {
      opacity: 1,
      scale: 1,
      y: 0,
      duration: 0.4,
      ease: "back.out(1.7)"
    })
    .to(iconRef.current, {
      scale: 1,
      rotation: 0,
      duration: 0.5,
      ease: "back.out(1.7)"
    }, "-=0.2")
    .to(textRef.current, {
      opacity: 1,
      x: 0,
      duration: 0.3,
      ease: "power2.out"
    }, "-=0.3")
    .to(".typing-dot", {
      scale: 1,
      duration: 0.2,
      ease: "back.out(1.7)",
      stagger: 0.1
    }, "-=0.2");

    // Continuous animations
    gsap.to(iconRef.current, {
      rotation: 360,
      duration: 3,
      repeat: -1,
      ease: "none"
    });

    gsap.to(".typing-dot", {
      y: -3,
      duration: 0.6,
      repeat: -1,
      yoyo: true,
      ease: "power2.inOut",
      stagger: {
        each: 0.2,
        repeat: -1
      }
    });

    // Subtle sparkle effect
    gsap.to(".sparkle", {
      scale: 1.2,
      opacity: 0.8,
      duration: 1.5,
      repeat: -1,
      yoyo: true,
      ease: "power2.inOut",
      stagger: 0.3
    });

    return () => {
      tl.kill();
    };
  }, [isVisible]);

  useEffect(() => {
    if (!isVisible && containerRef.current) {
      gsap.to(containerRef.current, {
        opacity: 0,
        scale: 0.9,
        y: -10,
        duration: 0.3,
        ease: "power2.inOut"
      });
    }
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div className="flex justify-start mb-4">
      <div 
        ref={containerRef}
        className="glassmorphic-card border border-white/30 dark:border-gray-700/50 rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm backdrop-blur-sm"
      >
        {/* Animated brain/thinking icon */}
        <div 
          ref={iconRef}
          className="w-6 h-6 bg-gradient-to-br from-sakura-400 to-pink-500 rounded-full flex items-center justify-center shadow-md"
        >
          <MessageCircle className="w-3 h-3 text-white" />
        </div>

        {/* Thinking message */}
        <div className="flex items-center gap-3">
          <span 
            ref={textRef}
            className="text-sm text-gray-700 dark:text-gray-300 font-medium"
          >
            {message}
          </span>

          {/* Animated dots */}
          <div ref={dotsRef} className="flex items-center gap-1">
            <div className="typing-dot w-1.5 h-1.5 bg-sakura-400 rounded-full"></div>
            <div className="typing-dot w-1.5 h-1.5 bg-sakura-400 rounded-full"></div>
            <div className="typing-dot w-1.5 h-1.5 bg-sakura-400 rounded-full"></div>
          </div>

          {/* Sparkle effects */}
          <div className="flex items-center gap-1 ml-2">
            <Sparkles className="sparkle w-3 h-3 text-sakura-400 opacity-60" />
            <Sparkles className="sparkle w-2.5 h-2.5 text-pink-400 opacity-50" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default TypingIndicator; 
