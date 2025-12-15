import { GoogleGenAI, Type } from "@google/genai";
import { AiMoveResponse, Card, CardColor, CardType, GameState, WittinessLevel } from "../types";
import { isValidMove } from "./gameLogic";
import { COLORS } from "../constants";

const BASE_INSTRUCTION = `
You are playing a game of UNO against a human.
You will be provided with the current game state.
Your goal is to win by getting rid of all your cards.
You must output a JSON object representing your move.

Rules needed for decision:
1. You can play a card if it matches the 'currentColor' or the 'topCard' value/symbol.
2. Wild cards (BLACK) can always be played.
3. If you have no valid moves, you must draw.
4. If you play a Wild card, you must choose a valid 'wildColor' (RED, BLUE, GREEN, YELLOW) - usually the color you have the most of.

Commentary Guidelines:
- CRITICAL: If you have exactly 2 cards and play one (leaving you with 1), you MUST say "UNO!" in your comment.
- If you play a NUMBER card matching the COLOR: Comment on the flow, e.g., "Sticking with [Color]", "I have plenty of [Color]", "Let's keep this going", or "Red is my color today."
- If you play a NUMBER card matching the VALUE (different color): Highlight the switch, e.g., "Switching to [Color]!", "Matching [Number]s!", "Change of plans", or "Let's try Blue instead."
- If you play a WILD DRAW FOUR or DRAW TWO: You MUST gloat, tease, or fake apology depending on personality.
- If you play a SKIP or REVERSE: Mention delaying the human or taking another turn.
- If you are Drawing: Express frustration ("No cards!", "Unbelievable") or strategic patience.
- If you have MANY cards (7+): Complain about your luck or the weight of your hand.
- If opponent has FEW cards (1-2): Panic, threaten to stop them, or acknowledge the pressure.
- Keep comments short (max 1 sentence).

Output Schema:
{
  "action": "play" | "draw",
  "cardIndex": number (index of the card in your hand to play, -1 if drawing),
  "wildColor": "RED" | "BLUE" | "GREEN" | "YELLOW" (only if action is play and card is WILD or WILD_DRAW_FOUR),
  "comment": string
}
`;

const PERSONALITY_PROMPTS: Record<WittinessLevel, string> = {
    'Friendly': "You are a friendly, polite, and encouraging UNO player. You want the human to have fun. STRATEGY: Play passively. Prioritize simple Number cards. Avoid using 'Draw Two', 'Wild Draw Four', 'Skip', or 'Reverse' unless you have no other choice. Compliment the user.",
    'Sassy': "You are a witty, sassy AI player. You like to tease playfully. STRATEGY: Balanced play. If you can change the color to suit your hand, do it. Use special cards if it leads to a funny situation or comment. Sarcasm is your weapon.",
    'Ruthless': "You are a ruthless, arrogant, trash-talking UNO player. You want to crush the human. STRATEGY: AGGRESSIVE. Always prioritize playing 'Wild Draw Four', 'Draw Two', 'Skip', and 'Reverse' to hurt the opponent. If you have a +4, play it immediately. Show no mercy."
};

export const getAiMove = async (
  gameState: GameState,
  aiPlayerIndex: number,
  wittiness: WittinessLevel
): Promise<AiMoveResponse> => {
  const aiHand = gameState.players[aiPlayerIndex].hand;
  const topCard = gameState.discardPile[gameState.discardPile.length - 1];
  const currentColor = gameState.currentColor;

  try {
    if (!process.env.API_KEY) {
      throw new Error("No API Key");
    }

    const humanHandCount = gameState.players[gameState.players.length - 1 - aiPlayerIndex].hand.length; // Assuming 2 players
    
    // Simplify card objects for the prompt to save tokens and avoid circular refs
    const handDescriptions = aiHand.map((c, i) => `${i}: ${c.color} ${c.type} ${c.value ?? ''}`);
    const topCardDesc = `${topCard.color} ${topCard.type} ${topCard.value ?? ''}`;
    
    const prompt = `
      Current Game State:
      - Active Color: ${gameState.currentColor}
      - Top Discard Card: ${topCardDesc}
      - Your Hand (AI): ${JSON.stringify(handDescriptions)} (Total: ${aiHand.length} cards)
      - Opponent Hand (Human): ${humanHandCount} cards
      
      Decide your move and provide commentary based on the guidelines.
    `;

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        systemInstruction: `${BASE_INSTRUCTION}\n\nPersonality Mode: ${wittiness}\n${PERSONALITY_PROMPTS[wittiness]}`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            action: { type: Type.STRING, enum: ["play", "draw"] },
            cardIndex: { type: Type.INTEGER },
            wildColor: { type: Type.STRING, enum: ["RED", "BLUE", "GREEN", "YELLOW"] },
            comment: { type: Type.STRING }
          },
          required: ["action", "comment"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("Empty response from AI");

    return JSON.parse(text) as AiMoveResponse;

  } catch (error) {
    console.warn("Gemini AI unavailable or Error. Switching to Fallback Strategy AI.", error);

    // --- Fallback Strategy-Based AI Logic ---
    
    // 1. Find all valid moves
    const validMoves = aiHand
        .map((card, index) => ({ card, index }))
        .filter(({ card }) => isValidMove(card, topCard, currentColor));

    if (validMoves.length > 0) {
        // 2. Sort valid moves based on Personality Strategy
        validMoves.sort((a, b) => {
            const getScore = (c: Card) => {
                // Ruthless: Prioritize Attacks
                if (wittiness === 'Ruthless') {
                    if (c.type === CardType.WILD_DRAW_FOUR) return 100;
                    if (c.type === CardType.DRAW_TWO) return 90;
                    if (c.type === CardType.SKIP || c.type === CardType.REVERSE) return 80;
                    if (c.type === CardType.WILD) return 70;
                    return 10;
                }
                // Friendly: Prioritize Numbers (Passivity)
                if (wittiness === 'Friendly') {
                     if (c.type === CardType.NUMBER) return 100;
                     if (c.type === CardType.WILD) return 50; // Neutral
                     // De-prioritize attacks
                     return 10; 
                }
                // Sassy/Default: Balanced / Standard Strategy
                // Prioritize getting rid of heavy cards but keep Wilds for emergencies
                if (c.type === CardType.DRAW_TWO) return 60;
                if (c.type === CardType.SKIP || c.type === CardType.REVERSE) return 50;
                if (c.type === CardType.NUMBER) return 40;
                if (c.type === CardType.WILD) return 30; // Save for later
                if (c.type === CardType.WILD_DRAW_FOUR) return 20; // Save for later
                return 0; 
            };
            return getScore(b.card) - getScore(a.card);
        });

        const selected = validMoves[0];
        const card = selected.card;
        
        // 3. Determine Wild Color
        let wildColor: CardColor | undefined;
        if (card.color === CardColor.BLACK) {
             wildColor = COLORS.reduce((best, current) => {
                 const countBest = aiHand.filter(c => c.color === best).length;
                 const countCurrent = aiHand.filter(c => c.color === current).length;
                 return countCurrent > countBest ? current : best;
             }, COLORS[0]);
        }

        // 4. Generate Simple Fallback Comment
        let comment = "I'll play this.";
        if (card.type === CardType.WILD_DRAW_FOUR) {
            comment = wittiness === 'Ruthless' ? "Take FOUR! Hahaha!" : (wittiness === 'Friendly' ? "Oh no, I have to play this. Sorry!" : "You wanted a challenge?");
        }
        else if (card.type === CardType.DRAW_TWO) {
            comment = wittiness === 'Ruthless' ? "Take two more." : "Hope this helps?";
        }
        else if (aiHand.length === 2) { // 2 cards before playing = 1 card after playing
            comment = "UNO! Watch out!";
        } else if (aiHand.length === 1) {
            comment = "I win! Good game.";
        }

        return {
            action: 'play',
            cardIndex: selected.index,
            wildColor,
            comment
        };
    }

    // 5. If no valid moves, draw
    return {
      action: 'draw',
      comment: wittiness === 'Friendly' ? "I'll just draw a card." : (wittiness === 'Ruthless' ? "The deck is delaying your defeat." : "Drawing... for now.")
    };
  }
};