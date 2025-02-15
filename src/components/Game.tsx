import React, { useEffect, useRef, useState } from 'react';
import { Trophy, Maximize2, Minimize2, Play, Pause, RotateCcw } from 'lucide-react';
import { Howl } from 'howler';

interface GameObject {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  speed: number;
  maxSpeed: number;
  acceleration: number;
  deceleration: number;
  direction?: number;
}

interface PowerUp {
  x: number;
  y: number;
  type: 'speed' | 'sticky' | 'giant';
  active: boolean;
  duration: number;
  startTime?: number;
}

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const PLAYER_RADIUS = 20;
const BALL_RADIUS = 12;
const BASE_FRICTION = 0.98;
const BASE_PLAYER_SPEED = 5;
const SPRINT_MULTIPLIER = 1.5;
const AI_SPEED = 4;
const KICK_CHARGE_RATE = 0.5;
const MAX_KICK_POWER = 20;
const POWER_UP_DURATION = 5000;

// Sound effects
const sounds = {
  kick: new Howl({
    src: ['https://assets.mixkit.co/active_storage/sfx/2432/2432-preview.mp3'],
    volume: 0.5
  }),
  goal: new Howl({
    src: ['https://assets.mixkit.co/active_storage/sfx/2053/2053-preview.mp3'],
    volume: 0.7
  }),
  bounce: new Howl({
    src: ['https://assets.mixkit.co/active_storage/sfx/2648/2648-preview.mp3'],
    volume: 0.3
  }),
  powerup: new Howl({
    src: ['https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3'],
    volume: 0.4
  })
};

// Drawing functions
const drawPlayer = (ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, direction: number) => {
  ctx.save();
  
  // Create gradient for player body
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, `${color}88`);
  
  // Draw player body
  ctx.fillStyle = gradient;
  ctx.shadowBlur = 15;
  ctx.shadowColor = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  
  // Draw jersey stripes
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - radius * 0.7, y - radius * 0.5);
  ctx.lineTo(x + radius * 0.7, y - radius * 0.5);
  ctx.stroke();
  
  // Draw direction indicator
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  const indicatorX = x + direction * radius * 0.5;
  ctx.arc(indicatorX, y, radius * 0.3, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.restore();
};

const drawBall = (ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, rotation: number) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  
  // Draw base white circle
  ctx.fillStyle = '#ffffff';
  ctx.shadowBlur = 10;
  ctx.shadowColor = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  
  // Draw pentagon pattern
  ctx.fillStyle = '#000000';
  ctx.shadowBlur = 0;
  for (let i = 0; i < 5; i++) {
    const angle = (i * 2 * Math.PI) / 5;
    ctx.beginPath();
    ctx.arc(radius * 0.5 * Math.cos(angle), radius * 0.5 * Math.sin(angle), radius * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // Draw connecting lines
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const angle1 = (i * 2 * Math.PI) / 5;
    const angle2 = ((i + 1) % 5 * 2 * Math.PI) / 5;
    ctx.beginPath();
    ctx.moveTo(radius * 0.5 * Math.cos(angle1), radius * 0.5 * Math.sin(angle1));
    ctx.lineTo(radius * 0.5 * Math.cos(angle2), radius * 0.5 * Math.sin(angle2));
    ctx.stroke();
  }
  
  ctx.restore();
};

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState({ player: 0, ai: 0 });
  const [timeLeft, setTimeLeft] = useState(180);
  const [gameOver, setGameOver] = useState(false);
  const [powerUps, setPowerUps] = useState<PowerUp[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [kickPower, setKickPower] = useState(0);
  const [isCharging, setIsCharging] = useState(false);
  const [isPaused, setIsPaused] = useState(true);
  const [teamNames, setTeamNames] = useState({ player: 'Red Team', ai: 'Blue Team' });
  const [isEditingNames, setIsEditingNames] = useState(false);

  const gameStateRef = useRef({
    player: {
      x: CANVAS_WIDTH / 4,
      y: CANVAS_HEIGHT / 2,
      vx: 0,
      vy: 0,
      radius: PLAYER_RADIUS,
      speed: BASE_PLAYER_SPEED,
      maxSpeed: BASE_PLAYER_SPEED * SPRINT_MULTIPLIER,
      acceleration: 0.5,
      deceleration: 0.8,
      direction: 1
    },
    ai: {
      x: (CANVAS_WIDTH / 4) * 3,
      y: CANVAS_HEIGHT / 2,
      vx: 0,
      vy: 0,
      radius: PLAYER_RADIUS,
      speed: AI_SPEED,
      maxSpeed: AI_SPEED,
      acceleration: 0.4,
      deceleration: 0.8,
      direction: -1
    },
    ball: {
      x: CANVAS_WIDTH / 2,
      y: CANVAS_HEIGHT / 2,
      vx: 0,
      vy: 0,
      radius: BALL_RADIUS,
      spin: 0,
      rotation: 0
    },
    keys: {
      up: false,
      down: false,
      left: false,
      right: false,
      space: false,
      shift: false
    }
  });

  const resetGame = () => {
    setScore({ player: 0, ai: 0 });
    setTimeLeft(180);
    setGameOver(false);
    setPowerUps([]);
    setKickPower(0);
    setIsCharging(false);
    
    const { player, ai, ball } = gameStateRef.current;
    
    player.x = CANVAS_WIDTH / 4;
    player.y = CANVAS_HEIGHT / 2;
    player.vx = 0;
    player.vy = 0;
    player.direction = 1;
    
    ai.x = (CANVAS_WIDTH / 4) * 3;
    ai.y = CANVAS_HEIGHT / 2;
    ai.vx = 0;
    ai.vy = 0;
    ai.direction = -1;
    
    ball.x = CANVAS_WIDTH / 2;
    ball.y = CANVAS_HEIGHT / 2;
    ball.vx = 0;
    ball.vy = 0;
    ball.spin = 0;
    ball.rotation = 0;

    setIsPaused(true);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let lastTime = performance.now();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault();
        toggleFullscreen();
        return;
      }

      if (e.key === 'Escape') {
        setIsPaused(prev => !prev);
        return;
      }

      switch (e.key) {
        case 'ArrowUp':
          gameStateRef.current.keys.up = true;
          break;
        case 'ArrowDown':
          gameStateRef.current.keys.down = true;
          break;
        case 'ArrowLeft':
          gameStateRef.current.keys.left = true;
          gameStateRef.current.player.direction = -1;
          break;
        case 'ArrowRight':
          gameStateRef.current.keys.right = true;
          gameStateRef.current.player.direction = 1;
          break;
        case ' ':
          if (!gameStateRef.current.keys.space) {
            setIsCharging(true);
          }
          gameStateRef.current.keys.space = true;
          break;
        case 'Shift':
          gameStateRef.current.keys.shift = true;
          break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp':
          gameStateRef.current.keys.up = false;
          break;
        case 'ArrowDown':
          gameStateRef.current.keys.down = false;
          break;
        case 'ArrowLeft':
          gameStateRef.current.keys.left = false;
          break;
        case 'ArrowRight':
          gameStateRef.current.keys.right = false;
          break;
        case ' ':
          if (gameStateRef.current.keys.space) {
            sounds.kick.play();
          }
          gameStateRef.current.keys.space = false;
          setIsCharging(false);
          break;
        case 'Shift':
          gameStateRef.current.keys.shift = false;
          break;
      }
    };

    const toggleFullscreen = async () => {
      if (!document.fullscreenElement) {
        try {
          await canvas.requestFullscreen();
          setIsFullscreen(true);
        } catch (err) {
          console.error('Error attempting to enable fullscreen:', err);
        }
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    };

    const spawnPowerUp = () => {
      if (Math.random() < 0.005 && powerUps.length < 2) {
        const types: PowerUp['type'][] = ['speed', 'sticky', 'giant'];
        const newPowerUp: PowerUp = {
          x: Math.random() * (CANVAS_WIDTH - 40) + 20,
          y: Math.random() * (CANVAS_HEIGHT - 40) + 20,
          type: types[Math.floor(Math.random() * types.length)],
          active: true,
          duration: POWER_UP_DURATION
        };
        setPowerUps(prev => [...prev, newPowerUp]);
      }
    };

    const applyPowerUp = (powerUp: PowerUp) => {
      const { player } = gameStateRef.current;
      switch (powerUp.type) {
        case 'speed':
          player.maxSpeed *= 1.5;
          break;
        case 'sticky':
          // Ball will stick to player longer
          break;
        case 'giant':
          player.radius *= 1.5;
          break;
      }
      sounds.powerup.play();
      powerUp.startTime = Date.now();
    };

    const updatePowerUps = () => {
      setPowerUps(prev => prev.filter(powerUp => {
        if (!powerUp.active || !powerUp.startTime) return true;
        if (Date.now() - powerUp.startTime >= powerUp.duration) {
          const { player } = gameStateRef.current;
          switch (powerUp.type) {
            case 'speed':
              player.maxSpeed = BASE_PLAYER_SPEED * SPRINT_MULTIPLIER;
              break;
            case 'giant':
              player.radius = PLAYER_RADIUS;
              break;
          }
          return false;
        }
        return true;
      }));
    };

    const updateGame = (timestamp: number) => {
      if (isPaused) {
        lastTime = timestamp;
        animationFrameId = requestAnimationFrame(updateGame);
        return;
      }

      const deltaTime = timestamp - lastTime;
      lastTime = timestamp;

      if (isCharging && kickPower < MAX_KICK_POWER) {
        setKickPower(prev => Math.min(prev + KICK_CHARGE_RATE, MAX_KICK_POWER));
      } else if (!isCharging && kickPower > 0) {
        setKickPower(0);
      }

      const { player, ai, ball, keys } = gameStateRef.current;

      const targetVx = (keys.left ? -1 : 0) + (keys.right ? 1 : 0);
      const targetVy = (keys.up ? -1 : 0) + (keys.down ? 1 : 0);
      const currentSpeed = keys.shift ? player.maxSpeed : player.speed;

      if (targetVx !== 0 && targetVy !== 0) {
        const norm = Math.sqrt(2);
        player.vx += (targetVx * currentSpeed / norm - player.vx) * player.acceleration;
        player.vy += (targetVy * currentSpeed / norm - player.vy) * player.acceleration;
      } else {
        player.vx += (targetVx * currentSpeed - player.vx) * player.acceleration;
        player.vy += (targetVy * currentSpeed - player.vy) * player.acceleration;
      }

      if (targetVx === 0) player.vx *= player.deceleration;
      if (targetVy === 0) player.vy *= player.deceleration;

      player.x += player.vx;
      player.y += player.vy;

      player.x = Math.max(player.radius, Math.min(CANVAS_WIDTH - player.radius, player.x));
      player.y = Math.max(player.radius, Math.min(CANVAS_HEIGHT - player.radius, player.y));

      const dx = ball.x - ai.x;
      const dy = ball.y - ai.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist > 0) {
        ai.vx += (dx / dist * ai.speed - ai.vx) * ai.acceleration;
        ai.vy += (dy / dist * ai.speed - ai.vy) * ai.acceleration;
        ai.direction = ai.vx > 0 ? 1 : -1;
      }

      ai.x += ai.vx;
      ai.y += ai.vy;
      ai.x = Math.max(ai.radius, Math.min(CANVAS_WIDTH - ai.radius, ai.x));
      ai.y = Math.max(ai.radius, Math.min(CANVAS_HEIGHT - ai.radius, ai.y));

      ball.x += ball.vx;
      ball.y += ball.vy;
      ball.vx *= BASE_FRICTION;
      ball.vy *= BASE_FRICTION;
      ball.rotation += ball.spin;

      if (ball.x < ball.radius || ball.x > CANVAS_WIDTH - ball.radius) {
        ball.vx *= -0.8;
        ball.x = ball.x < ball.radius ? ball.radius : CANVAS_WIDTH - ball.radius;
        sounds.bounce.play();
      }
      if (ball.y < ball.radius || ball.y > CANVAS_HEIGHT - ball.radius) {
        ball.vy *= -0.8;
        ball.y = ball.y < ball.radius ? ball.radius : CANVAS_HEIGHT - ball.radius;
        sounds.bounce.play();
      }

      const checkCollision = (obj1: GameObject, obj2: { x: number; y: number; radius: number }) => {
        const dx = obj1.x - obj2.x;
        const dy = obj1.y - obj2.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance < obj1.radius + obj2.radius;
      };

      if (checkCollision(player, ball)) {
        if (keys.space) {
          const angle = Math.atan2(ball.y - player.y, ball.x - player.x);
          const power = kickPower || 10;
          ball.vx = Math.cos(angle) * power;
          ball.vy = Math.sin(angle) * power;
          ball.spin = (player.vx * Math.cos(angle + Math.PI/2)) * 0.1;
          sounds.kick.play();
        } else {
          const angle = Math.atan2(ball.y - player.y, ball.x - player.x);
          const overlap = player.radius + ball.radius - Math.sqrt((ball.x - player.x)**2 + (ball.y - player.y)**2);
          ball.x += Math.cos(angle) * overlap;
          ball.y += Math.sin(angle) * overlap;
          
          ball.vx = (ball.vx + player.vx) * 0.5;
          ball.vy = (ball.vy + player.vy) * 0.5;
        }
      }

      if (checkCollision(ai, ball)) {
        const angle = Math.atan2(ball.y - ai.y, ball.x - ai.x);
        ball.vx = Math.cos(angle) * 12;
        ball.vy = Math.sin(angle) * 12;
        sounds.kick.play();
      }

      if (ball.x < 0) {
        setScore(prev => ({ ...prev, ai: prev.ai + 1 }));
        sounds.goal.play();
        ball.x = CANVAS_WIDTH / 2;
        ball.y = CANVAS_HEIGHT / 2;
        ball.vx = ball.vy = 0;
      } else if (ball.x > CANVAS_WIDTH) {
        setScore(prev => ({ ...prev, player: prev.player + 1 }));
        sounds.goal.play();
        ball.x = CANVAS_WIDTH / 2;
        ball.y = CANVAS_HEIGHT / 2;
        ball.vx = ball.vy = 0;
      }

      powerUps.forEach(powerUp => {
        if (powerUp.active && !powerUp.startTime) {
          const dx = player.x - powerUp.x;
          const dy = player.y - powerUp.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < player.radius + 10) {
            applyPowerUp(powerUp);
          }
        }
      });

      updatePowerUps();

      // Draw game state
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Draw field
      ctx.fillStyle = '#1a472a';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Field markings with glow
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#ffffff';

      // Center line
      ctx.beginPath();
      ctx.moveTo(CANVAS_WIDTH / 2, 0);
      ctx.lineTo(CANVAS_WIDTH / 2, CANVAS_HEIGHT);
      ctx.stroke();

      // Center circle
      ctx.beginPath();
      ctx.arc(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, 50, 0, Math.PI * 2);
      ctx.stroke();

      ctx.shadowBlur = 0;

      // Goals
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, CANVAS_HEIGHT / 2 - 50, 10, 100);
      ctx.fillRect(CANVAS_WIDTH - 10, CANVAS_HEIGHT / 2 - 50, 10, 100);

      // Draw players
      drawPlayer(ctx, player.x, player.y, player.radius, '#ff0000', player.direction);
      drawPlayer(ctx, ai.x, ai.y, ai.radius, '#0000ff', ai.direction);

      // Draw ball
      drawBall(ctx, ball.x, ball.y, ball.radius, ball.rotation);

      // Draw power-ups
      powerUps.forEach(powerUp => {
        if (powerUp.active) {
          ctx.fillStyle = powerUp.type === 'speed' ? '#FFD700' :
                         powerUp.type === 'sticky' ? '#FF00FF' :
                         '#00FF00';
          ctx.shadowBlur = 10;
          ctx.shadowColor = ctx.fillStyle;
          ctx.beginPath();
          ctx.arc(powerUp.x, powerUp.y, 10, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      });

      // Draw kick power meter
      if (isCharging) {
        const meterWidth = 100;
        const meterHeight = 10;
        const x = player.x - meterWidth / 2;
        const y = player.y - player.radius - 20;
        
        ctx.fillStyle = '#333333';
        ctx.fillRect(x, y, meterWidth, meterHeight);
        
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(x, y, (kickPower / MAX_KICK_POWER) * meterWidth, meterHeight);
      }

      // Draw pause overlay
      if (isPaused) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        
        ctx.font = 'bold 48px Arial';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText('PAUSED', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
        ctx.font = '24px Arial';
        ctx.fillText('Press ESC or click Play to continue', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 40);
      }

      spawnPowerUp();

      if (!gameOver) {
        animationFrameId = requestAnimationFrame(updateGame);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    animationFrameId = requestAnimationFrame(updateGame);

    const timer = setInterval(() => {
      if (!isPaused) {
        setTimeLeft(prev => {
          if (prev <= 1) {
            setGameOver(true);
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }
    }, 1000);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      cancelAnimationFrame(animationFrameId);
      clearInterval(timer);
    };
  }, [gameOver, powerUps, isCharging, kickPower, isPaused]);

  return (
    <div className="flex flex-col items-center gap-4 p-4 bg-gray-900 min-h-screen">
      <div className="flex items-center gap-8 text-2xl font-bold bg-gray-800 p-4 rounded-lg text-white">
        {isEditingNames ? (
          <>
            <input
              type="text"
              value={teamNames.player}
              onChange={(e) => setTeamNames(prev => ({ ...prev, player: e.target.value }))}
              className="bg-gray-700 text-red-500 px-2 py-1 rounded"
              maxLength={20}
            />
            <input
              type="text"
              value={teamNames.ai}
              onChange={(e) => setTeamNames(prev => ({ ...prev, ai: e.target.value }))}
              className="bg-gray-700 text-blue-500 px-2 py-1 rounded"
              maxLength={20}
            />
            <button
              onClick={() => setIsEditingNames(false)}
              className="text-sm bg-gray-700 px-3 py-1 rounded hover:bg-gray-600"
            >
              Save Names
            </button>
          </>
        ) : (
          <>
            <span className="text-red-500">{teamNames.player}: {score.player}</span>
            <span className="text-gray-300">Time: {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}</span>
            <span className="text-blue-500">{teamNames.ai}: {score.ai}</span>
            <button
              onClick={() => setIsEditingNames(true)}
              className="text-sm bg-gray-700 px-3 py-1 rounded hover:bg-gray-600"
            >
              Edit Names
            </button>
          </>
        )}
      </div>
      <div className="flex gap-4 mb-4">
        <button
          onClick={() => setIsPaused(!isPaused)}
          className="flex items-center gap-2 px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors text-white"
        >
          {isPaused ? <Play size={20} /> : <Pause size={20} />}
          {isPaused ? 'Start' : 'Pause'}
        </button>
        <button
          onClick={resetGame}
          className="flex items-center gap-2 px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors text-white"
        >
          <RotateCcw size={20} />
          Reset
        </button>
        <button
          onClick={() => canvasRef.current?.requestFullscreen()}
          className="flex items-center gap-2 px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors text-white"
        >
          {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
          {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="border-4 border-gray-700 rounded-lg shadow-lg bg-gray-800"
      />
      {gameOver && (
        <div className="text-center bg-gray-800 p-6 rounded-lg shadow-lg text-white">
          <h2 className="text-3xl font-bold mb-2 flex items-center justify-center gap-2">
            <Trophy className="text-yellow-500" />
            Game Over!
          </h2>
          <p className="text-xl">
            {score.player > score.ai
              ? `${teamNames.player} wins!`
              : score.player < score.ai
              ? `${teamNames.ai} wins!`
              : "It's a tie!"}
          </p>
        </div>
      )}
      <div className="text-sm text-gray-400 bg-gray-800 p-4 rounded-lg">
        <p>Controls:</p>
        <ul className="list-disc list-inside">
          <li>Arrow keys to move</li>
          <li>Hold Shift to sprint</li>
          <li>Hold Spacebar to charge kick</li>
          <li>ESC to pause/resume</li>
          <li>F11 or click button to toggle fullscreen</li>
        </ul>
      </div>
    </div>
  );
}