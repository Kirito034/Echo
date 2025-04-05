import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

type CuteCharacter = "cat" | "rabbit" | "bear" | "panda" | "duck";

interface TypingIndicatorProps {
  isTyping: boolean;
  className?: string;
  characterType?: CuteCharacter;
}

export function TypingIndicator({
  isTyping,
  className,
  characterType = "cat"
}: TypingIndicatorProps) {
  const [dots, setDots] = useState("");
  
  useEffect(() => {
    if (!isTyping) return;
    
    const interval = setInterval(() => {
      setDots(prev => {
        if (prev.length >= 3) return "";
        return prev + ".";
      });
    }, 500);
    
    return () => clearInterval(interval);
  }, [isTyping]);
  
  const getCharacterEmoji = (): string => {
    switch (characterType) {
      case "cat": return "🐱";
      case "rabbit": return "🐰";
      case "bear": return "🐻";
      case "panda": return "🐼";
      case "duck": return "🦆";
      default: return "🐱";
    }
  };
  
  const characterEmoji = getCharacterEmoji();
  
  return (
    <AnimatePresence>
      {isTyping && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.2 }}
          className={cn(
            "inline-flex items-center gap-1.5 text-sm text-muted-foreground bg-muted p-2 rounded-lg",
            className
          )}
        >
          <motion.span
            animate={{
              y: [0, -4, 0],
              transition: {
                duration: 1,
                repeat: Infinity,
                repeatType: "loop",
                ease: "easeInOut",
              },
            }}
            className="text-lg"
          >
            {characterEmoji}
          </motion.span>
          <span>typing{dots}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function TypingIndicatorWithName({
  isTyping,
  name,
  className,
  characterType = "cat"
}: TypingIndicatorProps & { name: string }) {
  const [dots, setDots] = useState("");
  
  useEffect(() => {
    if (!isTyping) return;
    
    const interval = setInterval(() => {
      setDots(prev => {
        if (prev.length >= 3) return "";
        return prev + ".";
      });
    }, 500);
    
    return () => clearInterval(interval);
  }, [isTyping]);
  
  const getCharacterEmoji = (): string => {
    switch (characterType) {
      case "cat": return "🐱";
      case "rabbit": return "🐰";
      case "bear": return "🐻";
      case "panda": return "🐼";
      case "duck": return "🦆";
      default: return "🐱";
    }
  };
  
  const characterEmoji = getCharacterEmoji();
  
  return (
    <AnimatePresence>
      {isTyping && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.2 }}
          className={cn(
            "inline-flex items-center gap-1.5 text-sm text-muted-foreground bg-muted p-2 rounded-lg",
            className
          )}
        >
          <motion.span
            animate={{
              y: [0, -4, 0],
              transition: {
                duration: 1,
                repeat: Infinity,
                repeatType: "loop",
                ease: "easeInOut",
              },
            }}
            className="text-lg"
          >
            {characterEmoji}
          </motion.span>
          <span>{name} is typing{dots}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}