import React, { useState, useEffect, useRef } from 'react';
import { createDeck, isValidMove, canPlayAny, calculateHandScore } from './services/gameLogic';
import { getAiMove } from './services/geminiService';
import { loadStats, saveStats, updateStats, getMostPlayedCards } from './services/statsService';
import { Card, CardColor, CardType, GameState, GameStatus, Player, WittinessLevel, GameStats, GameMode, MultiplayerMessage } from './types';
import { COLORS } from './constants';
import CardComponent from './components/CardComponent';
import ColorPicker from './components/ColorPicker';
import { COLOR_MAP } from './constants';
import Peer, { DataConnection } from 'peerjs';

// Helper to get immediate reaction when Human plays a special card
const getAiReactionToHumanMove = (card: Card, wittiness: WittinessLevel, aiHandSize: number): string | null => {
    const isBigHand = aiHandSize >= 7;

    const REACTIONS: Record<WittinessLevel, Record<string, string[]>> = {
        'Friendly': {
            'WILD_DRAW_FOUR': [
                "Oh wow, +4? That's harsh!", 
                "Ouch! Four whole cards?", 
                "I guess I needed those... maybe?", 
                "Well played! +4 is a strong move.",
                "Four cards! My hand is getting heavy!",
                "Wow, you really got me with that +4!"
            ],
            'DRAW_TWO': [
                "Two more for me? Thanks...", 
                "Aww, I was doing so well before this +2.", 
                "Okay, okay, I'll take two.",
                "Two cards isn't so bad, I suppose.",
                "Just two? I can handle that!"
            ],
            'SKIP': ["My turn? No? Okay.", "Skipping me again?", "I'll just wait here.", "Go ahead, take my turn!"],
            'REVERSE': ["Right back at you?", "Reversing...", "Changing direction!", "Back to you!"],
        },
        'Sassy': {
            'WILD_DRAW_FOUR': [
                "Rude. Just rude. +4?", 
                "Do you feel powerful now with your +4?", 
                "+4? Are you compensating for something?", 
                "I'm filing a complaint. Four cards is excessive.",
                "Wow, desperate move. Need a handicap?",
                "Four cards? You must be really scared of me."
            ],
            'DRAW_TWO': [
                "Generous of you, giving me 2.", 
                "I didn't ask for these two, but thanks.", 
                "Keep them coming, I'll still win with +2.",
                "Two cards? Is that the best you can do?",
                "Oh no, two cards. Whatever shall I do? (Sarcasm)"
            ],
            'SKIP': ["Afraid of my move?", "Silence is golden, I guess.", "You can't skip the inevitable.", "Skip me? Brave."],
            'REVERSE': ["No u.", "Uno Reverse card in real life?", "Dizzzy yet?", "Right back at ya."],
        },
        'Ruthless': {
            'WILD_DRAW_FOUR': [
                "This +4 changes nothing.", 
                "A desperate move. Four cards won't save you.", 
                "More cards mean more options to crush you.", 
                "Cheap trick. +4 is for the weak.",
                "You think burying me in cards will work?",
                "Four cards. Four more ways to beat you."
            ],
            'DRAW_TWO': [
                "Is that all you got? +2?", 
                "Pathetic. Two cards are nothing.", 
                "I'll win with these two as well.",
                "You're just delaying your defeat by giving me cards.",
                "Two cards? Hardly a setback."
            ],
            'SKIP': ["Delaying your defeat.", "Coward.", "I don't need turns to win.", "Skip me, I'm still calculating your demise."],
            'REVERSE': ["Pointless.", "You're just prolonging the game.", "Reverse all you want, I win.", "Logic dictates I will still crush you."],
        }
    };

    if (card.type === CardType.WILD_DRAW_FOUR) return getRandom(REACTIONS[wittiness]['WILD_DRAW_FOUR']);
    if (card.type === CardType.DRAW_TWO) return getRandom(REACTIONS[wittiness]['DRAW_TWO']);
    if (card.type === CardType.SKIP) return getRandom(REACTIONS[wittiness]['SKIP']);
    if (card.type === CardType.REVERSE) return getRandom(REACTIONS[wittiness]['REVERSE']);
    
    return null;
};

const getAiReactionToHumanDraw = (wittiness: WittinessLevel): string => {
    const REACTIONS: Record<WittinessLevel, string[]> = {
        'Friendly': ["Looking for something good?", "No matching cards?", "Take your time!", "Hope you find it!"],
        'Sassy': ["Deck tasting good?", "Fishing for a miracle?", "The card isn't there, trust me.", "Keep digging."],
        'Ruthless': ["Draw your entire deck.", "Nothing helpful?", "Give up.", "You're stalling."]
    };
    return getRandom(REACTIONS[wittiness]);
};

const getAiReactionToLuckyDraw = (wittiness: WittinessLevel): string => {
    const REACTIONS: Record<WittinessLevel, string[]> = {
        'Friendly': ["Ooh, lucky me! I can play this.", "Found one!", "Saved by the deck!", "Just what I needed."],
        'Sassy': ["Did you think I was stuck? Cute.", "The deck favors the bold.", "I create my own luck.", "Not so fast."],
        'Ruthless': ["You cannot stop fate.", "The cards obey me.", "Calculated.", "I always find a way."]
    };
    return getRandom(REACTIONS[wittiness]);
};

const getAiReactionToPass = (wittiness: WittinessLevel): string => {
    const REACTIONS: Record<WittinessLevel, string[]> = {
        'Friendly': ["I'll have to pass.", "Go ahead, your turn.", "Nothing this time."],
        'Sassy': ["I'm just biding my time.", "You can go... for now.", "Skip me, I dare you."],
        'Ruthless': ["Temporary setback.", "Enjoy your turn while you can.", "I'm waiting."]
    };
    return getRandom(REACTIONS[wittiness]);
};

const getAiEmoji = (cardType: CardType, wittiness: WittinessLevel): string | null => {
    if (cardType === CardType.WILD_DRAW_FOUR || cardType === CardType.DRAW_TWO) {
        if (wittiness === 'Friendly') return "😢";
        if (wittiness === 'Sassy') return "😒";
        if (wittiness === 'Ruthless') return "😡";
    }
    if (cardType === CardType.SKIP || cardType === CardType.REVERSE) {
        if (wittiness === 'Friendly') return "😮";
        if (wittiness === 'Sassy') return "🙄";
        if (wittiness === 'Ruthless') return "😤";
    }
    return null;
}

const getRandom = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];


const App: React.FC = () => {
  // --- Settings State ---
  const [targetScore, setTargetScore] = useState(500);
  const [wittinessLevel, setWittinessLevel] = useState<WittinessLevel>('Sassy');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  
  // --- Statistics State ---
  const [gameStats, setGameStats] = useState<GameStats>(loadStats());
  const matchStartTime = useRef<number>(0);
  const humanMovesRef = useRef<Card[]>([]);

  // --- Multiplayer State ---
  const [gameMode, setGameMode] = useState<GameMode>('AI');
  const [isMultiplayerMenuOpen, setIsMultiplayerMenuOpen] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [peerId, setPeerId] = useState<string>('');
  const [connectId, setConnectId] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<'DISCONNECTED' | 'CONNECTING' | 'CONNECTED'>('DISCONNECTED');
  const [showLocalIntermission, setShowLocalIntermission] = useState(false);
  
  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null);

  // --- Game State ---
  const [gameState, setGameState] = useState<GameState>({
    deck: [],
    discardPile: [],
    players: [],
    currentPlayerIndex: 0,
    direction: 1,
    status: GameStatus.LOBBY,
    winner: null,
    currentColor: CardColor.RED,
    aiComment: "Ready to lose?",
    isAiThinking: false,
  });

  const [pendingWildCard, setPendingWildCard] = useState<Card | null>(null); // For human color pick
  const [hasSaidUno, setHasSaidUno] = useState(false);
  const [unoBurst, setUnoBurst] = useState(false);
  
  // --- Visual Effects State ---
  const [specialEffect, setSpecialEffect] = useState<{ type: 'SKIP' | 'REVERSE', color: CardColor } | null>(null);
  const [effectKey, setEffectKey] = useState(0); // To force re-render of animation
  const [aiEmoji, setAiEmoji] = useState<string | null>(null); // Visual Reaction Emoji

  // --- Logic ---

  useEffect(() => {
    // Load stats on mount (already done in useState initial value, but good for re-sync if needed)
    setGameStats(loadStats());
    
    return () => {
        // Cleanup peer on unmount
        if (peerRef.current) peerRef.current.destroy();
    };
  }, []);

  // --- Multiplayer Connection Logic ---
  
  const initializePeer = () => {
      if (peerRef.current) return;
      
      const peer = new Peer();
      peerRef.current = peer;

      peer.on('open', (id) => {
          setPeerId(id);
          setConnectionStatus('DISCONNECTED');
      });

      peer.on('connection', (conn) => {
          // I am the HOST, someone connected to me
          connRef.current = conn;
          setConnectionStatus('CONNECTED');
          setIsHost(true);
          setupConnectionListeners(conn);
          
          // Start game after short delay
          setTimeout(() => startMultiplayerMatch(true), 1000);
      });
  };

  const connectToPeer = () => {
      if (!peerRef.current || !connectId) return;
      setConnectionStatus('CONNECTING');
      const conn = peerRef.current.connect(connectId);
      connRef.current = conn;
      
      conn.on('open', () => {
          setConnectionStatus('CONNECTED');
          setIsHost(false);
          setupConnectionListeners(conn);
      });
  };

  const setupConnectionListeners = (conn: DataConnection) => {
      conn.on('data', (data: unknown) => {
          const msg = data as MultiplayerMessage;
          if (msg.type === 'STATE_UPDATE') {
              setGameState(msg.payload);
              // Sync local visual refs if needed, though most are derived from state
          } else if (msg.type === 'PLAYER_MOVE') {
              // Only Host processes moves
              if (isHost) {
                  const { cardId, wildColor } = msg.payload;
                  const player = gameState.players[1]; // Client is always index 1
                  const cardIndex = player.hand.findIndex(c => c.id === cardId);
                  if (cardIndex !== -1) {
                      const card = player.hand[cardIndex];
                      finalizeMove(card, cardIndex, wildColor);
                  }
              }
          } else if (msg.type === 'PLAYER_DRAW') {
              if (isHost) {
                  handleMultiplayerDraw(1); // Draw for Client (index 1)
              }
          } else if (msg.type === 'RESTART_REQUEST') {
              if (isHost) startMultiplayerMatch(false);
          }
      });
      
      conn.on('close', () => {
          setConnectionStatus('DISCONNECTED');
          setGameState(prev => ({ ...prev, status: GameStatus.LOBBY }));
          alert("Opponent disconnected.");
      });
  };

  const sendMultiplayerMessage = (msg: MultiplayerMessage) => {
      if (connRef.current && connectionStatus === 'CONNECTED') {
          connRef.current.send(msg);
      }
  };

  // --- Game Setup ---

  const startMatch = () => {
    // Single Player AI Mode
    setGameMode('AI');
    matchStartTime.current = Date.now();
    humanMovesRef.current = [];

    const humanAvatar = `https://api.dicebear.com/9.x/avataaars/svg?seed=${Math.floor(Math.random() * 1000)}&backgroundColor=b6e3f4`;
    const aiAvatar = `https://api.dicebear.com/9.x/bottts/svg?seed=Gemini2.5&backgroundColor=c0aede`;

    setupRound([
      { id: 'p1', name: 'You', isAi: false, hand: [], score: 0, avatar: humanAvatar },
      { id: 'p2', name: 'Gemini', isAi: true, hand: [], score: 0, avatar: aiAvatar }
    ], 0);
  };

  const startLocalMatch = () => {
      setGameMode('LOCAL');
      matchStartTime.current = Date.now();
      humanMovesRef.current = [];

      const p1Avatar = `https://api.dicebear.com/9.x/avataaars/svg?seed=Player1${Math.floor(Math.random() * 100)}&backgroundColor=b6e3f4`;
      const p2Avatar = `https://api.dicebear.com/9.x/avataaars/svg?seed=Player2${Math.floor(Math.random() * 100)}&backgroundColor=ffd5dc`;

      setupRound([
          { id: 'p1', name: 'Player 1', isAi: false, hand: [], score: 0, avatar: p1Avatar },
          { id: 'p2', name: 'Player 2', isAi: false, hand: [], score: 0, avatar: p2Avatar }
      ], 0);
      
      // No intermission for the very first turn (Player 1 starts)
      setShowLocalIntermission(false);
  };

  const startMultiplayerMatch = (resetScores: boolean) => {
    // Only Host initiates setup
    if (!isHost) return;

    matchStartTime.current = Date.now();
    
    // Avatars
    const hostAvatar = `https://api.dicebear.com/9.x/avataaars/svg?seed=Host${Math.floor(Math.random() * 100)}&backgroundColor=b6e3f4`;
    const clientAvatar = `https://api.dicebear.com/9.x/avataaars/svg?seed=Client${Math.floor(Math.random() * 100)}&backgroundColor=ffd5dc`;

    let players = gameState.players;
    if (resetScores || players.length === 0) {
        players = [
            { id: 'host', name: 'Host (You)', isAi: false, hand: [], score: 0, avatar: hostAvatar },
            { id: 'client', name: 'Opponent', isAi: false, hand: [], score: 0, avatar: clientAvatar }
        ];
    } else {
        // Keep scores, clear hands
        players = players.map(p => ({ ...p, hand: [] }));
    }

    const deck = createDeck();
    let startCard = deck.shift()!;
    while(startCard.type === CardType.WILD_DRAW_FOUR) {
         deck.push(startCard);
         startCard = deck.shift()!;
    }
    const discardPile = [startCard];
    
    // Deal
    players = players.map(p => ({ ...p, hand: deck.splice(0, 7) }));
    
    const initialColor = startCard.color === CardColor.BLACK ? CardColor.RED : startCard.color;

    const newState: GameState = {
        deck,
        discardPile,
        players,
        currentPlayerIndex: 0,
        direction: 1,
        status: GameStatus.PLAYING,
        winner: null,
        roundWinner: undefined,
        pointsWon: 0,
        currentColor: initialColor,
        aiComment: "Online Match Started!",
        isAiThinking: false,
    };

    setGameState(newState);
    sendMultiplayerMessage({ type: 'STATE_UPDATE', payload: newState });
  };

  const nextRound = () => {
    if (gameMode === 'ONLINE') {
        if (isHost) {
            startMultiplayerMatch(false);
        } else {
             sendMultiplayerMessage({ type: 'RESTART_REQUEST' });
        }
        return;
    }
    
    if (gameMode === 'LOCAL') {
        const existingPlayers = gameState.players.map(p => ({ ...p, hand: [] }));
        const startPlayerIndex = (gameState.currentPlayerIndex + 1) % 2; // Rotate starter
        setupRound(existingPlayers, startPlayerIndex);
        setShowLocalIntermission(true); // Hide hand immediately
        return;
    }

    // AI Mode Logic
    const existingPlayers = gameState.players.map(p => ({
        ...p,
        hand: [] 
    }));
    const startPlayerIndex = Math.floor(Math.random() * existingPlayers.length);
    setupRound(existingPlayers, startPlayerIndex);
  };

  const setupRound = (playersConfig: Player[], startPlayerIndex: number) => {
    const deck = createDeck();
    let startCard = deck.shift()!;
    while(startCard.type === CardType.WILD_DRAW_FOUR) {
         deck.push(startCard);
         startCard = deck.shift()!;
    }

    const discardPile = [startCard];

    // Deal 7 cards to each player
    const players = playersConfig.map(p => ({
        ...p,
        hand: deck.splice(0, 7)
    }));

    const initialColor = startCard.color === CardColor.BLACK ? CardColor.RED : startCard.color;

    setGameState({
      deck,
      discardPile,
      players,
      currentPlayerIndex: startPlayerIndex,
      direction: 1,
      status: GameStatus.PLAYING,
      winner: null,
      roundWinner: undefined,
      pointsWon: 0,
      currentColor: initialColor,
      aiComment: wittinessLevel === 'Friendly' ? "Good luck! Have fun!" : "New round, new luck.",
      isAiThinking: false,
    });
    setHasSaidUno(false);
    setUnoBurst(false);
    setSpecialEffect(null);
    setAiEmoji(null);
  };

  // --- Helpers ---

  // Check for UNO status changes
  useEffect(() => {
    if (gameState.players.length > 0) {
        // If AI Mode, track human (index 0). If Online, track current player.
        // If Local, track current active player
        let localPlayerIndex = 0;
        if (gameMode === 'ONLINE' && !isHost) localPlayerIndex = 1;
        if (gameMode === 'LOCAL') localPlayerIndex = gameState.currentPlayerIndex;
        
        const localHandCount = gameState.players[localPlayerIndex]?.hand.length;
        
        if (localHandCount !== 1) {
            setHasSaidUno(false);
        }
    }
  }, [gameState.players, gameMode, isHost, gameState.currentPlayerIndex]);

  const nextTurn = (current: GameState): GameState => {
    let nextIndex = current.currentPlayerIndex + current.direction;
    if (nextIndex >= current.players.length) nextIndex = 0;
    if (nextIndex < 0) nextIndex = current.players.length - 1;

    // Trigger Intermission for Local Multiplayer
    if (gameMode === 'LOCAL') {
        setShowLocalIntermission(true);
    }

    return {
      ...current,
      currentPlayerIndex: nextIndex,
    };
  };

  const drawCards = (playerIndex: number, count: number, state: GameState): GameState => {
    // Create copies
    let deck = [...state.deck];
    const players = state.players.map(p => ({...p, hand: [...p.hand]}));
    let discardPile = [...state.discardPile];
    
    // Check deck empty
    if (deck.length < count) {
      if (discardPile.length > 1) {
         const top = discardPile.pop()!;
         const recycled = discardPile.sort(() => Math.random() - 0.5);
         deck = [...deck, ...recycled];
         discardPile = [top];
      }
    }

    // Double check we have cards now
    const cardsToDraw = Math.min(count, deck.length);
    if (cardsToDraw > 0) {
        const drawn = deck.splice(0, cardsToDraw);
        players[playerIndex].hand.push(...drawn);
    }

    return { ...state, deck, players, discardPile };
  };

  const handleCardEffect = (card: Card, state: GameState): GameState => {
    let newState = { ...state };
    
    if (card.color !== CardColor.BLACK) {
        newState.currentColor = card.color;
    }

    switch (card.type) {
      case CardType.SKIP:
        newState = nextTurn(newState);
        break;
      case CardType.REVERSE:
        if (newState.players.length === 2) {
            newState = nextTurn(newState);
        } else {
            newState.direction *= -1;
        }
        break;
      case CardType.DRAW_TWO:
        let victimIndex = newState.currentPlayerIndex + newState.direction;
        if (victimIndex >= newState.players.length) victimIndex = 0;
        if (victimIndex < 0) victimIndex = newState.players.length - 1;
        
        newState = drawCards(victimIndex, 2, newState);
        newState = nextTurn(newState);
        break;
      case CardType.WILD_DRAW_FOUR:
        let victim4Index = newState.currentPlayerIndex + newState.direction;
        if (victim4Index >= newState.players.length) victim4Index = 0;
        if (victim4Index < 0) victim4Index = newState.players.length - 1;

        newState = drawCards(victim4Index, 4, newState);
        newState = nextTurn(newState);
        break;
    }
    
    return newState;
  };

  // --- Human Interaction ---

  const handleHumanPlay = (card: Card, index: number) => {
    if (gameState.status !== GameStatus.PLAYING) return;
    
    // Logic Gate: Is it my turn?
    const isMyTurn = (gameMode === 'AI' && gameState.currentPlayerIndex === 0) ||
                     (gameMode === 'ONLINE' && isHost && gameState.currentPlayerIndex === 0) ||
                     (gameMode === 'ONLINE' && !isHost && gameState.currentPlayerIndex === 1) ||
                     (gameMode === 'LOCAL'); // In Local, it's always "my" turn if I'm viewing

    if (!isMyTurn) return;

    const topCard = gameState.discardPile[gameState.discardPile.length - 1];
    
    if (!isValidMove(card, topCard, gameState.currentColor)) {
      return;
    }

    if (card.color === CardColor.BLACK) {
        setPendingWildCard(card);
        return;
    }

    finalizeMove(card, index);
  };

  const finalizeMove = (card: Card, index: number, chosenWildColor?: CardColor, stateOverride?: GameState) => {
    // If Online Client: Send Move to Host, Do NOT update locally yet (Wait for state sync)
    if (gameMode === 'ONLINE' && !isHost) {
        sendMultiplayerMessage({
            type: 'PLAYER_MOVE',
            payload: { cardId: card.id, wildColor: chosenWildColor }
        });
        return;
    }

    const currentState = stateOverride || gameState;
    
    const newPlayers = currentState.players.map(p => ({
        ...p,
        hand: [...p.hand]
    }));
    
    let newState: GameState = {
        ...currentState,
        players: newPlayers,
        discardPile: [...currentState.discardPile, card]
    };
    
    const playerIndex = newState.currentPlayerIndex;
    const player = newState.players[playerIndex];
    player.hand.splice(index, 1);

    if (card.color === CardColor.BLACK && chosenWildColor) {
        newState.currentColor = chosenWildColor;
    }

    // --- Stats Tracking ---
    if (!player.isAi) {
        humanMovesRef.current.push(card);
    }

    // --- Trigger Visual Effects ---
    if (card.type === CardType.SKIP) {
        setSpecialEffect({ type: 'SKIP', color: card.color });
        setEffectKey(k => k + 1);
        setTimeout(() => setSpecialEffect(null), 1500);
    } else if (card.type === CardType.REVERSE) {
        setSpecialEffect({ type: 'REVERSE', color: card.color });
        setEffectKey(k => k + 1);
        setTimeout(() => setSpecialEffect(null), 1500);
    }

    // --- Check for UNO (1 card left) ---
    if (player.hand.length === 1) {
        // Simple UNO visual trigger if it's the other player (AI or Remote or Local Opponent)
        // In Local, we might want to show it for the CURRENT player too? 
        // Let's just show burst if it's NOT the player viewing (which is tricky in Local).
        // For Local, we'll skip the burst for the active player to avoid visual clutter
        if (gameMode !== 'LOCAL' && playerIndex !== 0) {
             setUnoBurst(true);
             setTimeout(() => setUnoBurst(false), 2000);
        }
    }

    // --- Reaction Logic ---
    if (gameMode === 'AI' && !player.isAi) {
        // AI is player 1
        const aiHandCount = newState.players[1].hand.length;
        const reaction = getAiReactionToHumanMove(card, wittinessLevel, aiHandCount);
        if (reaction) newState.aiComment = reaction;
        
        // Emoji Reaction
        const emoji = getAiEmoji(card.type, wittinessLevel);
        if (emoji) {
            setAiEmoji(emoji);
            setTimeout(() => setAiEmoji(null), 2000);
        }
    } else if (gameMode === 'ONLINE') {
        newState.aiComment = `Player ${playerIndex === 0 ? '1' : '2'} played ${card.color} ${card.type}`;
    } else if (gameMode === 'LOCAL') {
        // Simple log for local
        newState.aiComment = `${player.name} played ${card.color} ${card.type}`;
    }

    // --- Win / Round Over Logic ---
    if (player.hand.length === 0) {
        const opponentPoints = newState.players
            .filter((_, i) => i !== playerIndex)
            .reduce((sum, p) => sum + calculateHandScore(p.hand), 0);
        
        player.score += opponentPoints;
        const isMatchOver = player.score >= targetScore;

        newState.roundWinner = player.name;
        newState.pointsWon = opponentPoints;
        
        if (isMatchOver) {
            newState.status = GameStatus.GAME_OVER;
            newState.winner = player.name;
            newState.aiComment = "Game Over!";
            if (gameMode === 'AI') {
                 const matchDuration = (Date.now() - matchStartTime.current) / 1000;
                 const updatedStats = updateStats(gameStats, !player.isAi, matchDuration, humanMovesRef.current);
                 setGameStats(updatedStats);
                 saveStats(updatedStats);
            }
        } else {
            newState.status = GameStatus.ROUND_OVER;
            newState.aiComment = "Round Over!";
        }

        setGameState(newState);
        if (gameMode === 'ONLINE' && isHost) {
             sendMultiplayerMessage({ type: 'STATE_UPDATE', payload: newState });
        }
        return;
    }

    newState = handleCardEffect(card, newState);
    newState = nextTurn(newState);

    setGameState(newState);
    setPendingWildCard(null);

    // Sync State if Host
    if (gameMode === 'ONLINE' && isHost) {
        sendMultiplayerMessage({ type: 'STATE_UPDATE', payload: newState });
    }
  };

  const handleHumanDraw = () => {
    if (gameState.status !== GameStatus.PLAYING) return;
    
    const isMyTurn = (gameMode === 'AI' && gameState.currentPlayerIndex === 0) ||
                     (gameMode === 'ONLINE' && isHost && gameState.currentPlayerIndex === 0) ||
                     (gameMode === 'ONLINE' && !isHost && gameState.currentPlayerIndex === 1) ||
                     (gameMode === 'LOCAL');

    if (!isMyTurn) return;

    if (gameMode === 'ONLINE' && !isHost) {
        sendMultiplayerMessage({ type: 'PLAYER_DRAW' });
        return;
    }

    let newState = drawCards(gameState.currentPlayerIndex, 1, gameState);
    
    // Reaction to drawing (AI Mode)
    if (gameMode === 'AI') {
        newState.aiComment = getAiReactionToHumanDraw(wittinessLevel);
    } else {
        newState.aiComment = `${gameState.players[gameState.currentPlayerIndex].name} drew a card.`;
    }

    newState = nextTurn(newState);
    setGameState(newState);

    if (gameMode === 'ONLINE' && isHost) {
        sendMultiplayerMessage({ type: 'STATE_UPDATE', payload: newState });
    }
  };

  const handleMultiplayerDraw = (playerIndex: number) => {
      // Called by Host when receiving PLAYER_DRAW msg
      let newState = drawCards(playerIndex, 1, gameState);
      newState.aiComment = `Player ${playerIndex + 1} drew a card.`;
      newState = nextTurn(newState);
      setGameState(newState);
      sendMultiplayerMessage({ type: 'STATE_UPDATE', payload: newState });
  };

  const handleColorPick = (color: CardColor) => {
     if (!pendingWildCard) return;
     const myIndex = (gameMode === 'ONLINE' && !isHost) ? 1 : (gameMode === 'LOCAL' ? gameState.currentPlayerIndex : 0);
     const index = gameState.players[myIndex].hand.findIndex(c => c.id === pendingWildCard.id);
     if (index === -1) {
         setPendingWildCard(null);
         return;
     }
     finalizeMove(pendingWildCard, index, color);
  };

  const handleSayUno = () => {
    setHasSaidUno(true);
    setUnoBurst(true);
    setTimeout(() => setUnoBurst(false), 2000);

    // If AI Mode, add commentary
    if (gameMode === 'AI') {
        const sassyReactions = [
            "UNO?! I was just letting you win...",
            "One card? You better hope it's a Wild Draw 4.",
            "Don't celebrate yet, human!",
            "Loud noises won't save you.",
        ];
        const reaction = sassyReactions[Math.floor(Math.random() * sassyReactions.length)];
        setGameState(prev => ({ ...prev, aiComment: reaction }));
    }
  };

  // --- AI Logic ---

  useEffect(() => {
    let mounted = true;
    if (gameMode !== 'AI') return; // Don't run AI logic in Online/Local mode

    const runAiTurn = async () => {
        const currentPlayer = gameState.players[gameState.currentPlayerIndex];
        
        if (gameState.status === GameStatus.PLAYING && currentPlayer.isAi && !gameState.isAiThinking) {
            
            setGameState(prev => ({ ...prev, isAiThinking: true }));
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            if (!mounted) return;

            try {
                const move = await getAiMove(gameState, gameState.currentPlayerIndex, wittinessLevel);
                if (!mounted) return;

                setGameState(prev => {
                    const next = { ...prev, isAiThinking: false, aiComment: move.comment };
                    return next;
                });

                if (move.action === 'play' && typeof move.cardIndex === 'number') {
                    const aiHand = gameState.players[gameState.currentPlayerIndex].hand;
                    if (move.cardIndex >= 0 && move.cardIndex < aiHand.length) {
                         const card = aiHand[move.cardIndex];
                         finalizeMove(card, move.cardIndex, move.wildColor);
                    } else {
                        handleAiDraw();
                    }
                } else {
                    handleAiDraw();
                }

            } catch (e) {
                console.error("AI Turn Error", e);
                setGameState(prev => ({ ...prev, isAiThinking: false }));
                handleAiDraw();
            }
        }
    };

    runAiTurn();
    return () => { mounted = false; };
  }, [gameState.currentPlayerIndex, gameState.status, gameMode]); 

  const handleAiDraw = () => {
      // 1. Draw a card
      const stateWithDraw = drawCards(gameState.currentPlayerIndex, 1, gameState);
      
      const player = stateWithDraw.players[gameState.currentPlayerIndex];
      const drawnCardIndex = player.hand.length - 1;
      const drawnCard = player.hand[drawnCardIndex];
      const topCard = stateWithDraw.discardPile[stateWithDraw.discardPile.length - 1];

      // 2. Check if the drawn card is playable immediately
      if (isValidMove(drawnCard, topCard, stateWithDraw.currentColor)) {
          stateWithDraw.aiComment = getAiReactionToLuckyDraw(wittinessLevel);
          let wildColor: CardColor | undefined;
          if (drawnCard.color === CardColor.BLACK) {
             wildColor = COLORS.reduce((best, current) => {
                 const countBest = player.hand.filter(c => c.color === best).length;
                 const countCurrent = player.hand.filter(c => c.color === current).length;
                 return countCurrent > countBest ? current : best;
             }, COLORS[0]);
          }
          finalizeMove(drawnCard, drawnCardIndex, wildColor, stateWithDraw);
      } else {
          stateWithDraw.aiComment = getAiReactionToPass(wittinessLevel);
          const finalState = nextTurn(stateWithDraw);
          setGameState(finalState);
      }
  };

  // --- Modals ---
  const renderMultiplayerMenu = () => {
      if (!isMultiplayerMenuOpen) return null;

      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in">
            <div className="bg-slate-800 p-8 rounded-3xl shadow-2xl max-w-md w-full border border-slate-700 relative text-center">
                <button 
                    onClick={() => { setIsMultiplayerMenuOpen(false); setConnectionStatus('DISCONNECTED'); }}
                    className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>

                <h2 className="text-3xl font-black text-white mb-6 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-green-400">
                    Online PvP
                </h2>

                {connectionStatus === 'DISCONNECTED' && (
                    <div className="space-y-4">
                        <button
                            onClick={() => { initializePeer(); }}
                            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl text-xl shadow-lg transition-transform hover:scale-105"
                        >
                            Host Game
                        </button>
                        <div className="relative">
                            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-600"></div></div>
                            <div className="relative flex justify-center"><span className="bg-slate-800 px-4 text-slate-400 text-sm">OR</span></div>
                        </div>
                        <div>
                            <input 
                                type="text"
                                placeholder="Enter Host Code"
                                value={connectId}
                                onChange={(e) => setConnectId(e.target.value)}
                                className="w-full bg-slate-700 border-2 border-slate-600 rounded-lg p-3 text-white text-center font-mono tracking-widest mb-3 focus:border-blue-500 focus:outline-none uppercase"
                            />
                            <button
                                onClick={connectToPeer}
                                disabled={!connectId}
                                className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:hover:bg-green-600 text-white font-bold py-4 rounded-xl text-xl shadow-lg transition-transform hover:scale-105"
                            >
                                Join Game
                            </button>
                        </div>
                    </div>
                )}

                {connectionStatus === 'DISCONNECTED' && peerId && isHost && (
                     <div className="mt-4 p-4 bg-slate-900 rounded-xl border border-slate-700">
                         <div className="flex justify-center items-center mb-2">
                             <div className="w-4 h-4 rounded-full border-2 border-slate-500 border-t-white animate-spin mr-2"></div>
                             <span className="text-slate-400 text-sm">Generating Code...</span>
                         </div>
                     </div>
                )}

                {(connectionStatus === 'CONNECTING' || (isHost && peerId && connectionStatus === 'DISCONNECTED')) && !isHost && (
                     <div className="mt-8">
                         <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                         <p className="text-slate-300 animate-pulse">Connecting...</p>
                     </div>
                )}

                {isHost && peerId && connectionStatus !== 'CONNECTED' && (
                     <div className="space-y-4">
                         <div className="bg-slate-900 p-6 rounded-xl border-2 border-blue-500/50">
                             <p className="text-slate-400 text-sm uppercase font-bold mb-2">Share this code</p>
                             <div className="text-4xl font-mono font-black text-white tracking-wider break-all select-all cursor-pointer" onClick={() => navigator.clipboard.writeText(peerId)}>
                                 {peerId}
                             </div>
                             <p className="text-xs text-slate-500 mt-2">Click to copy</p>
                         </div>
                         <div className="flex justify-center items-center gap-2 text-slate-400">
                             <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                             <span>Waiting for opponent...</span>
                         </div>
                     </div>
                )}
            </div>
        </div>
      );
  };

  const renderSettingsModal = () => {
    if (!isSettingsOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in">
            <div className="bg-slate-800 p-8 rounded-3xl shadow-2xl max-w-md w-full border border-slate-700 relative">
                <button 
                    onClick={() => setIsSettingsOpen(false)}
                    className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
                
                <h2 className="text-3xl font-black text-white mb-8 text-center bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
                    Game Settings
                </h2>

                {/* Target Score */}
                <div className="mb-8">
                    <div className="flex justify-between items-center mb-4">
                        <label className="text-slate-300 font-bold uppercase tracking-wider text-sm">Target Score</label>
                        <span className="text-2xl font-mono text-blue-400 font-bold">{targetScore}</span>
                    </div>
                    <input 
                        type="range" 
                        min="100" 
                        max="1000" 
                        step="50" 
                        value={targetScore} 
                        onChange={(e) => setTargetScore(Number(e.target.value))}
                        className="w-full h-3 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                </div>

                {/* AI Personality */}
                <div className="mb-8">
                     <div className="flex items-center gap-2 mb-4">
                        <label className="text-slate-300 font-bold uppercase tracking-wider text-sm">AI Personality</label>
                     </div>
                     <div className="grid grid-cols-3 gap-2">
                        {(['Friendly', 'Sassy', 'Ruthless'] as WittinessLevel[]).map((level) => (
                            <button
                                key={level}
                                onClick={() => setWittinessLevel(level)}
                                className={`py-3 px-2 rounded-xl text-sm font-bold transition-all border-2 ${
                                    wittinessLevel === level 
                                    ? 'bg-blue-600 border-blue-400 text-white shadow-lg scale-105' 
                                    : 'bg-slate-700 border-transparent text-slate-400 hover:bg-slate-600'
                                }`}
                            >
                                {level}
                            </button>
                        ))}
                     </div>
                </div>

                <button 
                    onClick={() => setIsSettingsOpen(false)}
                    className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white font-bold py-4 rounded-xl text-xl shadow-lg"
                >
                    Save & Close
                </button>
            </div>
        </div>
    );
  };

  const renderStatsModal = () => {
    if (!isStatsOpen) return null;

    const winRate = gameStats.matchesPlayed > 0 
        ? Math.round((gameStats.matchesWon / gameStats.matchesPlayed) * 100) 
        : 0;
    
    const minutes = Math.floor(gameStats.longestMatchTime / 60);
    const seconds = Math.round(gameStats.longestMatchTime % 60);
    const timeString = `${minutes}m ${seconds}s`;
    
    const mostPlayed = getMostPlayedCards(gameStats);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm animate-fade-in">
            <div className="bg-slate-800 p-8 rounded-3xl shadow-2xl max-w-lg w-full border border-slate-700 relative overflow-hidden">
                <button 
                    onClick={() => setIsStatsOpen(false)}
                    className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
                <h2 className="text-3xl font-black text-white mb-6 text-center">Your Statistics</h2>
                
                 {/* Top Row: Win Rate & Streak */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-slate-700/50 p-4 rounded-2xl flex flex-col items-center">
                        <span className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Win Rate</span>
                        <div className="relative w-20 h-20 flex items-center justify-center">
                             <svg className="absolute inset-0 w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                                <path className="text-slate-600" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="4" />
                                <path className={`${winRate > 50 ? 'text-green-500' : 'text-blue-500'}`} strokeDasharray={`${winRate}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="4" />
                             </svg>
                             <span className="text-xl font-black text-white">{winRate}%</span>
                        </div>
                        <div className="text-xs text-slate-500 mt-2 font-mono">{gameStats.matchesWon}W - {gameStats.matchesLost}L</div>
                    </div>
                    
                    <div className="grid grid-rows-2 gap-4">
                        <div className="bg-slate-700/50 p-3 rounded-2xl flex flex-col justify-center items-center">
                             <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Current Streak</span>
                             <span className="text-3xl font-black text-yellow-400">{gameStats.currentStreak} 🔥</span>
                        </div>
                        <div className="bg-slate-700/50 p-3 rounded-2xl flex flex-col justify-center items-center">
                             <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Best Streak</span>
                             <span className="text-3xl font-black text-white">{gameStats.bestStreak} 🏆</span>
                        </div>
                    </div>
                </div>

                {/* Middle Row: Misc Stats */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                     <div className="bg-slate-700/30 p-4 rounded-xl border border-slate-600">
                         <span className="text-slate-400 text-xs block mb-1">Total Games</span>
                         <span className="text-2xl font-bold text-white font-mono">{gameStats.matchesPlayed}</span>
                     </div>
                     <div className="bg-slate-700/30 p-4 rounded-xl border border-slate-600">
                         <span className="text-slate-400 text-xs block mb-1">Longest Game</span>
                         <span className="text-2xl font-bold text-white font-mono">{timeString}</span>
                     </div>
                </div>

                {/* Bottom Row: Favorite Cards */}
                <div>
                    <h3 className="text-slate-300 text-sm font-bold uppercase tracking-wider mb-4 border-b border-slate-700 pb-2">Your Most Played Cards</h3>
                    {mostPlayed.length === 0 ? (
                        <p className="text-slate-500 text-center py-4 italic">Play a game to see your favorites!</p>
                    ) : (
                        <div className="flex justify-center gap-4">
                            {mostPlayed.map(({card, count}, idx) => (
                                <div key={idx} className="flex flex-col items-center animate-fade-in-up" style={{ animationDelay: `${idx * 100}ms` }}>
                                    <div className="transform scale-75 origin-top">
                                        <CardComponent card={card} playable={false} disabled />
                                    </div>
                                    <span className="text-white font-bold bg-slate-700 px-3 py-1 rounded-full text-xs -mt-2 z-10">{count}x</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
  };


  // --- Render ---

  if (gameState.status === GameStatus.LOBBY) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 text-white font-sans relative">
        {renderSettingsModal()}
        {renderStatsModal()}
        {renderMultiplayerMenu()}
        
        {/* Settings Button (Top Right) */}
        <button 
            onClick={() => setIsSettingsOpen(true)}
            className="absolute top-6 right-6 p-3 bg-slate-800 rounded-full hover:bg-slate-700 transition-colors shadow-lg border border-slate-700 group"
        >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-slate-400 group-hover:text-blue-400 transition-colors">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.42.097-2.099.46-.84.445-1.543.466-2.135-.166-.64-.684-.523-1.636.082-2.583.565-.884.622-1.722.257-2.317-.373-.606-1.282-.954-2.222-.888C3.58 10.4 3 9.773 3 8.92c0-.98.795-1.523 1.222-1.694.94-.376 1.85-.318 2.22-.887.23-.353.18-.846-.117-1.464-.537-1.118-.328-2.228.327-2.906.637-.659 1.58-.696 2.385-.224.846.495 1.597.45 2.162-.164.555-.604.708-1.558.455-2.483C11.52 3.513 12.122 3 12.98 3c.98 0 1.522.795 1.693 1.222.376.94.319 1.85.888 2.22.353.23.846.18 1.463-.117 1.118-.537 2.228-.328 2.906-.659.637-1.58.696-2.385.224-.846-.495-1.597-.45-2.162.164-.604-.555-1.558-.708-2.483-.455z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
        </button>

        <h1 className="text-6xl md:text-8xl font-black mb-8 bg-clip-text text-transparent bg-gradient-to-r from-red-500 via-yellow-400 to-blue-500 animate-float drop-shadow-lg">
          GEMINI UNO!
        </h1>
        <p className="text-xl md:text-2xl text-slate-300 mb-8 max-w-lg text-center">
            Challenge the AI. First to {targetScore} points wins.
        </p>
        
        <div className="flex flex-col gap-6 w-full max-w-xs items-center">
            <button
              onClick={startMatch}
              className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white font-bold py-4 px-8 rounded-full text-2xl shadow-xl transition-transform hover:scale-105 active:scale-95"
            >
              Start AI Match
            </button>

            <button
              onClick={() => { setGameMode('ONLINE'); setIsMultiplayerMenuOpen(true); }}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 px-8 rounded-full text-2xl shadow-xl transition-transform hover:scale-105 active:scale-95 flex justify-center items-center gap-2"
            >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15L12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" />
                </svg>
                Online PvP
            </button>

            <button
              onClick={startLocalMatch}
              className="w-full bg-slate-700 hover:bg-slate-600 border border-slate-500 text-white font-bold py-4 px-8 rounded-full text-xl shadow-md transition-colors flex justify-center items-center gap-2"
            >
               <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                 <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
               </svg>
               2 Player Local
            </button>

            <button
              onClick={() => setIsStatsOpen(true)}
              className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white font-bold py-3 px-8 rounded-full text-lg shadow-md transition-colors flex items-center justify-center gap-2"
            >
               <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-yellow-500">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
               </svg>
               View Statistics
            </button>
        </div>
      </div>
    );
  }

  if (gameState.status === GameStatus.GAME_OVER) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 text-white">
        <h1 className="text-6xl font-black mb-4 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
            {gameState.winner === 'You' ? (gameMode === 'ONLINE' ? 'YOU WON!' : 'MATCH WINNER!') : (gameMode === 'ONLINE' ? 'OPPONENT WON!' : (gameMode === 'LOCAL' ? `${gameState.winner} WINS!` : 'AI WINS MATCH!'))}
        </h1>
        <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700 mb-8 w-full max-w-md">
            <h2 className="text-2xl font-bold mb-4 border-b border-slate-600 pb-2">Final Scores</h2>
            {gameState.players.map(p => (
                <div key={p.id} className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                         <img src={p.avatar} alt={p.name} className="w-12 h-12 rounded-full border-2 border-white/20 bg-slate-700" />
                         <span className={`text-xl font-bold ${p.id === 'p1' ? 'text-green-400' : 'text-purple-400'}`}>{p.name}</span>
                    </div>
                    <span className="text-3xl font-mono font-bold text-white">{p.score}</span>
                </div>
            ))}
        </div>
        <p className="text-xl text-slate-400 mb-8 italic">"{gameState.aiComment}"</p>
        <button
          onClick={startMatch}
          className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-8 rounded-full text-xl shadow-lg"
        >
          {gameMode === 'ONLINE' ? 'Disconnect to Lobby' : 'New Match'}
        </button>
      </div>
    );
  }

  if (gameState.status === GameStatus.ROUND_OVER) {
    return (
      <div className="min-h-screen bg-slate-900/90 flex flex-col items-center justify-center p-4 text-white fixed inset-0 z-50 backdrop-blur-md">
         <div className="bg-slate-800 border-2 border-yellow-500/50 p-8 rounded-3xl shadow-2xl max-w-md w-full text-center animate-fade-in-up">
            <h2 className="text-4xl font-black mb-2 text-yellow-400">ROUND OVER!</h2>
            <p className="text-xl text-white mb-6">
                {gameState.roundWinner} won 
                <span className="font-bold text-yellow-300 ml-2">+{gameState.pointsWon} points</span>
            </p>
            
            <div className="bg-slate-900/50 rounded-xl p-4 mb-8">
                <h3 className="text-sm uppercase tracking-widest text-slate-400 mb-4">Current Standings</h3>
                {gameState.players.map(p => (
                    <div key={p.id} className="flex justify-between items-center mb-3 last:mb-0">
                        <div className="flex items-center gap-3">
                            <img src={p.avatar} alt={p.name} className="w-8 h-8 rounded-full bg-slate-700 border border-white/20" />
                            <span className={p.id === 'p1' ? 'text-green-400 font-bold' : 'text-slate-300'}>{p.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-2xl font-mono font-bold">{p.score}</span>
                            <span className="text-xs text-slate-500">/ {targetScore}</span>
                        </div>
                    </div>
                ))}
            </div>

            {gameMode === 'ONLINE' && !isHost ? (
                <div className="text-slate-400 animate-pulse font-bold">Waiting for Host to start next round...</div>
            ) : (
                <button
                    onClick={nextRound}
                    className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-black font-black py-4 rounded-xl text-xl shadow-lg transition-transform hover:scale-105"
                >
                    Next Round
                </button>
            )}
         </div>
      </div>
    );
  }

  const humanPlayer = (gameMode === 'ONLINE' && !isHost) 
        ? gameState.players[1] 
        : (gameMode === 'LOCAL' ? gameState.players[gameState.currentPlayerIndex] : gameState.players[0]);
  
  const otherPlayer = (gameMode === 'ONLINE' && !isHost) 
        ? gameState.players[0] 
        : (gameMode === 'LOCAL' ? gameState.players[(gameState.currentPlayerIndex + 1) % 2] : gameState.players[1]);
  
  const topCard = gameState.discardPile[gameState.discardPile.length - 1];
  
  // Is it my turn to interact with UI?
  // AI Mode: current index 0
  // Online Host: current index 0
  // Online Client: current index 1
  // Local: Always true (since we swap views)
  const isHumanTurn = (gameMode === 'AI' && gameState.currentPlayerIndex === 0) ||
                      (gameMode === 'ONLINE' && isHost && gameState.currentPlayerIndex === 0) ||
                      (gameMode === 'ONLINE' && !isHost && gameState.currentPlayerIndex === 1) ||
                      (gameMode === 'LOCAL');

  // Background gradient based on current active color
  const bgGradient = 
    gameState.currentColor === CardColor.RED ? 'from-red-900/50 to-slate-900' :
    gameState.currentColor === CardColor.BLUE ? 'from-blue-900/50 to-slate-900' :
    gameState.currentColor === CardColor.GREEN ? 'from-green-900/50 to-slate-900' :
    gameState.currentColor === CardColor.YELLOW ? 'from-yellow-900/50 to-slate-900' :
    'from-slate-800 to-black';

  return (
    <div className={`min-h-screen bg-gradient-to-br ${bgGradient} overflow-hidden flex flex-col transition-colors duration-1000`}>
        
        {/* Settings Modal - Now Available In-Game */}
        {renderSettingsModal()}
        {renderStatsModal()}
        {renderMultiplayerMenu()}

        {/* Local Intermission Overlay */}
        {showLocalIntermission && gameMode === 'LOCAL' && (
            <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/95 backdrop-blur-lg animate-fade-in p-8 text-center">
                 <h2 className="text-4xl font-black text-white mb-8">
                     Pass Device to <span className={gameState.currentPlayerIndex === 0 ? 'text-green-400' : 'text-purple-400'}>{gameState.players[gameState.currentPlayerIndex].name}</span>
                 </h2>
                 <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-white mb-8 shadow-2xl animate-bounce">
                     <img src={gameState.players[gameState.currentPlayerIndex].avatar} alt="Next Player" className="w-full h-full object-cover" />
                 </div>
                 <button
                    onClick={() => setShowLocalIntermission(false)}
                    className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 px-12 rounded-full text-2xl shadow-[0_0_30px_rgba(37,99,235,0.5)] transition-transform hover:scale-105"
                 >
                     I am Ready
                 </button>
            </div>
        )}

        {/* Color Picker Modal */}
        {pendingWildCard && <ColorPicker onSelect={handleColorPick} />}

        {/* UNO Burst Animation Overlay */}
        {unoBurst && (
            <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center">
                <div className="text-9xl font-black text-yellow-400 italic drop-shadow-[0_0_50px_rgba(255,0,0,0.8)] animate-bounce scale-150 transform">
                    UNO!
                </div>
            </div>
        )}

        {/* Special Effect Overlay (SKIP/REVERSE) */}
        {specialEffect && (
            <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center">
                <div key={effectKey} className="animate-effect-pop flex flex-col items-center drop-shadow-[0_0_20px_rgba(0,0,0,0.8)]">
                    {specialEffect.type === 'SKIP' && (
                        <>
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-48 h-48 text-red-500 mb-2 filter drop-shadow-lg">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                            </svg>
                            <span className="text-8xl font-black text-white italic uppercase tracking-tighter text-outline-black">SKIP!</span>
                        </>
                    )}
                    {specialEffect.type === 'REVERSE' && (
                        <>
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-48 h-48 text-blue-400 mb-2 filter drop-shadow-lg">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                            </svg>
                             <span className="text-8xl font-black text-white italic uppercase tracking-tighter text-outline-black">REVERSE!</span>
                        </>
                    )}
                </div>
            </div>
        )}

        {/* Top Bar / AI Info */}
        <div className="flex flex-col md:flex-row justify-between items-center p-2 md:p-4 bg-black/20 backdrop-blur-md border-b border-white/5 z-20 gap-2 md:gap-0">
             
             {/* Player Scores HUD */}
             <div className="flex items-center gap-4 bg-black/30 px-4 py-2 rounded-full border border-white/10 order-2 md:order-1">
                 {gameState.players.map(p => (
                     <div key={p.id} className="flex items-center gap-3">
                         <img src={p.avatar} alt={p.name} className="w-8 h-8 rounded-full bg-slate-700 border border-white/20 shadow-sm" />
                         <div className="flex flex-col">
                             <span className={`text-[10px] font-bold uppercase tracking-wider ${p.id === 'p1' ? 'text-green-400' : 'text-purple-400'}`}>{p.name}</span>
                             <span className="text-white font-mono font-bold leading-none text-sm">{p.score}</span>
                         </div>
                     </div>
                 ))}
                 <div className="h-6 w-px bg-white/20 mx-1"></div>
                 <div className="flex flex-col items-center">
                    <span className="text-[10px] text-slate-400 uppercase">Target</span>
                    <span className="text-slate-300 font-mono text-xs">{targetScore}</span>
                 </div>
             </div>

             {/* AI/Opponent Avatar & Chat */}
             <div className="flex flex-1 items-center justify-center w-full md:w-auto order-1 md:order-2 px-4">
                 <div className="relative">
                     {gameState.isAiThinking && (
                        <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 opacity-75 blur-sm animate-spin-slow"></div>
                     )}
                     <div className={`relative w-10 h-10 md:w-12 md:h-12 rounded-full flex-shrink-0 shadow-lg border-2 border-white/20 bg-slate-800 overflow-hidden z-10 transition-transform duration-300 ${gameState.isAiThinking ? 'scale-110' : ''}`}>
                         {aiEmoji && (
                             <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-20 text-2xl animate-bounce">
                                 {aiEmoji}
                             </div>
                         )}
                         <div className={`${aiEmoji ? 'animate-shake' : ''} ${aiEmoji ? 'ring-2 ring-red-500' : ''} w-full h-full`}>
                             <img src={otherPlayer.avatar} alt="Opponent" className="w-full h-full object-cover" />
                         </div>
                     </div>
                 </div>
                 
                 <div className="relative bg-white/10 ml-4 p-2 md:p-3 rounded-r-xl rounded-bl-xl border border-white/10 shadow-sm w-full max-w-lg transition-all duration-500 min-h-[48px] flex items-center">
                    {gameState.isAiThinking ? (
                         <div className="flex space-x-1 px-2">
                             <div className="w-2 h-2 bg-white/60 rounded-full typing-dot"></div>
                             <div className="w-2 h-2 bg-white/60 rounded-full typing-dot"></div>
                             <div className="w-2 h-2 bg-white/60 rounded-full typing-dot"></div>
                         </div>
                    ) : (
                        <p className="text-white text-xs md:text-sm font-medium italic leading-tight animate-fade-in">"{gameState.aiComment}"</p>
                    )}
                 </div>
             </div>

             <div className="flex items-center gap-2 order-3">
                {gameMode === 'AI' && (
                    <div className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${
                        wittinessLevel === 'Friendly' ? 'bg-green-900/50 border-green-500 text-green-200' :
                        wittinessLevel === 'Ruthless' ? 'bg-red-900/50 border-red-500 text-red-200' :
                        'bg-purple-900/50 border-purple-500 text-purple-200'
                    }`}>
                        {wittinessLevel}
                    </div>
                )}
                {gameMode === 'ONLINE' && (
                     <div className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border bg-blue-900/50 border-blue-500 text-blue-200">
                         {isHost ? 'HOST' : 'CLIENT'}
                     </div>
                )}
                <div className="text-white font-mono bg-black/40 px-3 py-1 rounded-lg border border-white/10 text-xs md:text-sm">
                   Opponent Hand: {otherPlayer.hand.length}
                </div>
                <button 
                    onClick={() => setIsSettingsOpen(true)}
                    className="p-1.5 bg-black/40 hover:bg-white/10 rounded-lg border border-white/10 transition-colors text-white/70 hover:text-white"
                    title="Settings"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.212 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.581-.495.644-.869l.214-1.281z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                </button>
             </div>
        </div>

        {/* Game Board Area */}
        <div className="flex-1 flex flex-col items-center justify-center relative perspective-1000 py-4">
            
            {/* Opponent Hand (Face Down) */}
            <div className="flex -space-x-4 md:-space-x-8 mb-8 md:mb-16 transform scale-75 md:scale-90 opacity-90 transition-all">
                {otherPlayer.hand.map((card, i) => (
                    <div key={card.id} className="transform transition-transform duration-500" style={{ zIndex: i }}>
                        <CardComponent 
                            card={card} 
                            isFaceDown 
                            className="shadow-lg"
                            ownerName={otherPlayer.name}
                        />
                    </div>
                ))}
            </div>

            {/* Center Field */}
            <div className="flex items-center gap-8 md:gap-16 z-10">
                {/* Draw Pile */}
                <div className="relative group cursor-pointer" onClick={isHumanTurn ? handleHumanDraw : undefined}>
                    <div className="absolute inset-0 bg-white/10 rounded-xl transform rotate-3 scale-105 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <CardComponent 
                        card={{ id: 'deck', color: CardColor.BLACK, type: CardType.NUMBER, value: 0 }} 
                        isFaceDown 
                        isDrawPile // Pass this prop to render "DRAW" on the card
                        className="shadow-2xl shadow-black/50"
                    />
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <span className="bg-black/60 text-white text-xs font-bold px-2 py-1 rounded backdrop-blur-sm">DRAW</span>
                    </div>
                </div>

                {/* Current Active Color Indicator (Center) */}
                <div className={`w-32 h-32 md:w-48 md:h-48 rounded-full ${COLOR_MAP[gameState.currentColor]} bg-opacity-20 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 blur-3xl -z-10 animate-pulse transition-colors duration-1000`}></div>

                {/* Discard Pile */}
                <div className="relative">
                     {/* Show previous discard below for depth */}
                    {gameState.discardPile.length > 1 && (
                         <div className="absolute top-1 left-2 transform rotate-6 opacity-60">
                            <CardComponent card={gameState.discardPile[gameState.discardPile.length - 2]} />
                         </div>
                    )}
                    <div className="transform transition-all duration-500 animate-float">
                        <CardComponent card={topCard} />
                    </div>
                </div>
            </div>

            {/* Turn Indicator */}
            <div className="mt-12 mb-4">
                 {isHumanTurn ? (
                     <div className="text-white font-bold text-xl px-8 py-3 bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/50 rounded-2xl shadow-[0_0_15px_rgba(16,185,129,0.2)] backdrop-blur-md animate-pulse">
                         {gameMode === 'LOCAL' ? `${gameState.players[gameState.currentPlayerIndex].name}'s Turn` : 'Your Turn'}
                     </div>
                 ) : (
                     <div className="text-slate-400 font-bold text-lg px-8 py-3 bg-black/40 border border-white/5 rounded-2xl backdrop-blur-md flex items-center gap-3">
                         <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
                         <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></div>
                         <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></div>
                         <span className="tracking-widest uppercase text-sm">Opponent Turn...</span>
                     </div>
                 )}
            </div>

        </div>

        {/* Player Hand */}
        <div className="p-4 md:pb-8 flex flex-col items-center bg-black/40 backdrop-blur-sm border-t border-white/5 z-20">
             
             {/* Say UNO Button - Floats above hand */}
             {humanPlayer.hand.length === 1 && !hasSaidUno && gameState.status === GameStatus.PLAYING && (
                <button
                    onClick={handleSayUno}
                    className="mb-6 bg-gradient-to-r from-red-600 to-orange-500 text-white font-black italic text-3xl py-4 px-12 rounded-full shadow-[0_0_30px_rgba(255,0,0,0.6)] animate-bounce hover:scale-110 hover:shadow-[0_0_50px_rgba(255,0,0,1)] active:scale-95 z-50 border-4 border-yellow-300 transition-all duration-300"
                >
                    UNO!
                </button>
             )}

             <div className="flex items-end justify-center -space-x-8 md:-space-x-12 overflow-x-visible w-full px-8 pb-8 min-h-[180px] pt-12">
                {humanPlayer.hand.map((card, index) => {
                    const playable = isHumanTurn && isValidMove(card, topCard, gameState.currentColor);
                    // Rotation for fanning
                    const rotation = (index - (humanPlayer.hand.length - 1) / 2) * 3;
                    
                    return (
                        <div 
                            key={card.id} 
                            style={{ 
                                transform: `rotate(${rotation}deg) translateY(${Math.abs(rotation) * 2}px)`,
                                zIndex: index
                            }}
                            className={`
                                relative 
                                transition-all duration-200 cubic-bezier(0.4, 0, 0.2, 1) origin-bottom 
                                hover:z-50
                                group
                                cursor-pointer
                            `}
                        >
                            <CardComponent 
                                card={card} 
                                playable={playable}
                                disabled={!isHumanTurn}
                                onClick={() => handleHumanPlay(card, index)}
                                className={`
                                    ${playable 
                                        ? 'animate-playable z-10' 
                                        : 'brightness-75 opacity-90 group-hover:brightness-100 group-hover:opacity-100'
                                    } 
                                    !transition-all !duration-300 !ease-[cubic-bezier(0.34,1.56,0.64,1)]
                                    group-hover:scale-125 group-hover:-translate-y-12 group-hover:shadow-[0_0_40px_rgba(255,255,255,0.6)]
                                    group-hover:z-50
                                    group-hover:animate-none
                                `}
                                ownerName={humanPlayer.name}
                            />
                        </div>
                    );
                })}
             </div>
             
             {/* Controls hint */}
             <div className="text-white/40 text-xs mt-0 font-mono uppercase tracking-widest pb-2">
                 {isHumanTurn ? (canPlayAny(humanPlayer.hand, topCard, gameState.currentColor) ? 'Select a card' : 'No moves available - Draw a card') : 'Wait for Opponent'}
             </div>
        </div>
    </div>
  );
};

export default App;