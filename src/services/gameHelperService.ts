import { fetchTokenBalance } from "./airstackService";

export async function getMatchWinner(
    id: number,
    player1_id: number | null,
    player1_move: number | null,
    player2_id: number | null,
    player2_move: number | null,
) {
    let winnerId;

    if (player1_id === null) {
        throw new Error(`Invalid match ${id}`);
    }

    if (player2_id === null) {
        winnerId = player1_id;
    } else if (player1_move === player2_move) {
        // handle tiebreaker
        winnerId = await getTieWinner(player1_id, player2_id);
    } else if (player1_move === null) {
        // player 1 didn't make a move
        winnerId = player2_id;
    } else if (player2_move === null) {
        // player 2 didn't make a move
        winnerId = player1_id;
    } else {
        // players made differing moves
        if ((player1_move === 0 && player2_move === 2) ||  // Rock beats Slizards
            (player1_move === 1 && player2_move === 0) ||  // Pepe beats Rock
            (player1_move === 2 && player2_move === 1)) {  // Slizards beats Pepe
            winnerId = player1_id;
        } else {
            winnerId = player2_id;
        }
    }

    if (!winnerId) {
        throw new Error(`Invalid match ${id}`);
    }

    return winnerId;
}

export async function getTieWinner(
    player1_id: number,
    player2_id: number,
) {
    const player1Balance = await fetchTokenBalance(player1_id.toString());
    const player2Balance = await fetchTokenBalance(player2_id.toString());

    console.log(`Handling tiebreaker: ${player1_id}: ${player1Balance} vs ${player2_id}: ${player2Balance}`);

    return player1Balance > player2Balance ? player1_id : player2_id;
}