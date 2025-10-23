
"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

const GamePage = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [gameState, setGameState] = useState<'waiting' | 'playing' | 'over'>('waiting');
    const [score, setScore] = useState(0);

    const gameLoopRef = useRef<number>();
    const dinoRef = useRef({ x: 50, y: 150, width: 20, height: 20, vy: 0, isJumping: false });
    const obstaclesRef = useRef<{ x: number, width: number, height: number }[]>([]);
    const frameCountRef = useRef(0);

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw Ground
        ctx.fillStyle = 'hsl(var(--foreground))';
        ctx.fillRect(0, 170, canvas.width, 2);
        
        // Draw Dino
        ctx.fillStyle = 'hsl(var(--primary))';
        ctx.fillRect(dinoRef.current.x, dinoRef.current.y, dinoRef.current.width, dinoRef.current.height);

        // Draw Obstacles
        ctx.fillStyle = 'hsl(var(--destructive))';
        obstaclesRef.current.forEach(obstacle => {
            ctx.fillRect(obstacle.x, 170 - obstacle.height, obstacle.width, obstacle.height);
        });
        
        // Draw Score
        ctx.fillStyle = 'hsl(var(--foreground))';
        ctx.font = '16px sans-serif';
        ctx.fillText(`Score: ${score}`, 10, 20);

        if (gameState === 'over') {
            ctx.fillStyle = 'hsl(var(--foreground))';
            ctx.font = '24px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Game Over', canvas.width / 2, canvas.height / 2 - 20);
            ctx.font = '16px sans-serif';
            ctx.fillText(`Final Score: ${score}`, canvas.width / 2, canvas.height / 2 + 10);
        }

    }, [score, gameState]);


    const update = useCallback(() => {
        if (gameState !== 'playing') return;

        // Update Dino
        const dino = dinoRef.current;
        dino.y += dino.vy;
        dino.vy += 0.5; // Gravity

        if (dino.y >= 150) {
            dino.y = 150;
            dino.vy = 0;
            dino.isJumping = false;
        }

        // Update Obstacles
        frameCountRef.current++;
        if (frameCountRef.current % 120 === 0) {
            const height = Math.random() * 20 + 15;
            obstaclesRef.current.push({ x: 300, width: 15, height: height });
        }

        obstaclesRef.current.forEach(obstacle => {
            obstacle.x -= 2;
        });

        obstaclesRef.current = obstaclesRef.current.filter(o => o.x > -o.width);

        // Collision detection
        obstaclesRef.current.forEach(obstacle => {
            if (
                dino.x < obstacle.x + obstacle.width &&
                dino.x + dino.width > obstacle.x &&
                dino.y < 170 &&
                dino.y + dino.height > 170 - obstacle.height
            ) {
                setGameState('over');
            }
        });
        
        // Update score
        setScore(prev => prev + 1);

    }, [gameState]);


    const gameLoop = useCallback(() => {
        update();
        draw();
        gameLoopRef.current = requestAnimationFrame(gameLoop);
    }, [draw, update]);

    const startGame = () => {
        dinoRef.current = { x: 50, y: 150, width: 20, height: 20, vy: 0, isJumping: false };
        obstaclesRef.current = [];
        frameCountRef.current = 0;
        setScore(0);
        setGameState('playing');
    };

    const handleJump = useCallback((e: KeyboardEvent) => {
        if (e.code === 'Space' || e.code === 'ArrowUp') {
            e.preventDefault();
            if (gameState === 'waiting' || gameState === 'over') {
                startGame();
            } else if (gameState === 'playing' && !dinoRef.current.isJumping) {
                dinoRef.current.vy = -10;
                dinoRef.current.isJumping = true;
            }
        }
    }, [gameState]);
    
    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = 300;
          canvas.height = 200;
        }

        window.addEventListener('keydown', handleJump);
        gameLoopRef.current = requestAnimationFrame(gameLoop);

        return () => {
            window.removeEventListener('keydown', handleJump);
            if (gameLoopRef.current) {
              cancelAnimationFrame(gameLoopRef.current);
            }
        };
    }, [handleJump, gameLoop]);


    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
        >
            <Card className="w-full max-w-md mx-auto">
                <CardHeader>
                    <CardTitle>Dinosaur Game</CardTitle>
                    <CardDescription>Press Space or Up Arrow to jump over obstacles. Press it again to restart.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center gap-4">
                    <canvas ref={canvasRef} className="rounded-lg border bg-card" />
                     <Button onClick={startGame}>
                        {gameState === 'over' ? 'Restart Game' : 'Start Game'}
                    </Button>
                </CardContent>
            </Card>
        </motion.div>
    );
};

export default GamePage;
