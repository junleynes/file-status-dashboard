
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
    const dinoRef = useRef({ x: 50, y: 150, width: 44, height: 47, vy: 0, isJumping: false });
    const obstaclesRef = useRef<{ x: number; y: number; width: number; height: number; type: 'cactus' }[]>([]);
    const frameCountRef = useRef(0);
    const gameSpeedRef = useRef(3);

    const drawDino = (ctx: CanvasRenderingContext2D, dino: { x: number, y: number, width: number, height: number }) => {
        ctx.fillStyle = '#666'; // A visible gray color
        ctx.fillRect(dino.x, dino.y, 20, 2); // tail
        ctx.fillRect(dino.x + 2, dino.y - 12, 18, 14); // body
        ctx.fillRect(dino.x + 20, dino.y - 20, 14, 8); // head
        ctx.fillRect(dino.x + 8, dino.y + 2, 4, 8); // leg
        ctx.fillRect(dino.x + 16, dino.y + 2, 4, 8); // leg
    };

    const drawCactus = (ctx: CanvasRenderingContext2D, obstacle: { x: number, y: number, width: number, height: number }) => {
        ctx.fillStyle = '#666'; // A visible gray color
        ctx.fillRect(obstacle.x + 5, obstacle.y, 10, obstacle.height); // Main stem
        ctx.fillRect(obstacle.x, obstacle.y + 10, 5, 15); // Left arm
        ctx.fillRect(obstacle.x + 15, obstacle.y + 15, 5, 15); // Right arm
    };


    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw Ground
        ctx.fillStyle = '#888';
        ctx.fillRect(0, 170, canvas.width, 2);
        
        // Draw Dino
        drawDino(ctx, { ...dinoRef.current, y: dinoRef.current.y - dinoRef.current.height + 20 });

        // Draw Obstacles
        obstaclesRef.current.forEach(obstacle => {
            drawCactus(ctx, obstacle);
        });
        
        // Draw Score
        ctx.fillStyle = '#888';
        ctx.font = '16px sans-serif';
        ctx.fillText(`Score: ${score}`, 10, 20);

        if (gameState === 'over') {
            ctx.fillStyle = '#888';
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

        const groundY = 170 - (dino.height - 20);
        if (dino.y >= groundY) {
            dino.y = groundY;
            dino.vy = 0;
            dino.isJumping = false;
        }

        // Update Obstacles
        frameCountRef.current++;
        if (frameCountRef.current % Math.max(50, 150 - Math.floor(score/100)) === 0) { // Obstacles appear faster over time
            const cactusHeight = Math.random() * 25 + 25; // 25 to 50px high
            obstaclesRef.current.push({ x: 300, y: 170 - cactusHeight, width: 20, height: cactusHeight, type: 'cactus' });
        }

        obstaclesRef.current.forEach(obstacle => {
            obstacle.x -= gameSpeedRef.current;
        });

        // Increase speed over time
        if (frameCountRef.current % 500 === 0) {
            gameSpeedRef.current += 0.2;
        }


        obstaclesRef.current = obstaclesRef.current.filter(o => o.x > -o.width);

        // Collision detection
        obstaclesRef.current.forEach(obstacle => {
             const dinoHitbox = { x: dino.x, y: dino.y - (dino.height - 20), width: dino.width - 10, height: dino.height };
             const obstacleHitbox = { x: obstacle.x, y: obstacle.y, width: obstacle.width, height: obstacle.height };

            if (
                dinoHitbox.x < obstacleHitbox.x + obstacleHitbox.width &&
                dinoHitbox.x + dinoHitbox.width > obstacleHitbox.x &&
                dinoHitbox.y < obstacleHitbox.y + obstacleHitbox.height &&
                dinoHitbox.height + dinoHitbox.y > obstacleHitbox.y
            ) {
                setGameState('over');
                gameSpeedRef.current = 3;
            }
        });
        
        // Update score
        setScore(prev => prev + 1);

    }, [gameState, score]);


    const gameLoop = useCallback(() => {
        update();
        draw();
        gameLoopRef.current = requestAnimationFrame(gameLoop);
    }, [draw, update]);

    const startGame = () => {
        dinoRef.current = { x: 50, y: 150, width: 44, height: 47, vy: 0, isJumping: false };
        obstaclesRef.current = [];
        frameCountRef.current = 0;
        setScore(0);
        gameSpeedRef.current = 3;
        setGameState('playing');
    };

    const handleJump = useCallback((e: Event) => {
        e.preventDefault();
        if (e instanceof KeyboardEvent && (e.code !== 'Space' && e.code !== 'ArrowUp')) {
            return;
        }

        if (gameState === 'waiting' || gameState === 'over') {
            startGame();
        } else if (gameState === 'playing' && !dinoRef.current.isJumping) {
            dinoRef.current.vy = -12;
            dinoRef.current.isJumping = true;
        }
    }, [gameState]);
    
    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = 300;
          canvas.height = 200;
        }

        window.addEventListener('keydown', handleJump);
        canvas?.addEventListener('touchstart', handleJump);

        gameLoopRef.current = requestAnimationFrame(gameLoop);

        return () => {
            window.removeEventListener('keydown', handleJump);
            canvas?.removeEventListener('touchstart', handleJump);
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
                    <CardDescription>Press Space, Up Arrow, or tap the screen to jump. Do it again to restart.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center gap-4">
                    <canvas ref={canvasRef} className="rounded-lg border bg-card cursor-pointer" />
                     <Button onClick={startGame}>
                        {gameState === 'over' ? 'Restart Game' : 'Start Game'}
                    </Button>
                </CardContent>
            </Card>
        </motion.div>
    );
};

export default GamePage;
