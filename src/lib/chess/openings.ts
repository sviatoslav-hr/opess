import { ChessBoard, chessMoveInfoEquals, type ChessMoveInfo } from '$lib/chess/engine';
import { PieceColor } from '$lib/chess/basic';
import { PGN, type PGNMoveNode } from '$lib/chess/pgn';
import { moveToLongAlgebraic } from '$lib/chess/algebraic';
import LONDON_SYSTEM_PGN from '$lib/chess/openings/london-system.pgn?raw';
import { loadFen } from '$lib/chess/fen';

// PERF: This whole thing must be rebuilt.
//       We need the functionality to quickly check if certain move
//       is valid based on the opening.

export interface Opening {
	name: string;
	fen: string;
	color: PieceColor;
	rootNode: PGNMoveNode;
}

export function getOpenings(): Opening[] {
	const openings: Opening[] = [];

	addOpening({
		name: 'London System',
		color: PieceColor.WHITE,
		pgn: LONDON_SYSTEM_PGN,
	});

	type OpeningParams = Omit<Opening, 'rootNode' | 'fen'> & { pgn: string };
	function addOpening(params: OpeningParams): void {
		const [tree, pgnError] = PGN.parse(params.pgn);
		if (pgnError) {
			throw new Error(`Failed to parse PGN for ${params.name}: ${pgnError.type}`, {
				cause: pgnError,
			});
		}
		const opening: Opening = {
			name: params.name,
			color: params.color,
			rootNode: tree.root,
			fen: tree.fen,
		};
		openings.push(opening);
	}
	return openings;
}

export function matchOpeningNextNode(
	opening: Opening,
	node: PGNMoveNode | null,
	move: ChessMoveInfo
): Either<PGNMoveNode, string> {
	const nextNode = node ? node.next : opening.rootNode;
	if (!nextNode) {
		return [, 'Opening line is finished, no next move available.'];
	}
	const nextNodes = [nextNode].concat(nextNode.variations);
	const matchedNode = nextNodes.find((n) => chessMoveInfoEquals(n.move, move));
	if (matchedNode) {
		return [matchedNode];
	}
	return [, formatOpeningMoveMismatchError(opening.name, move, nextNodes)];
}

function formatOpeningMoveMismatchError(
	openingName: string,
	actualMove: ChessMoveInfo,
	nextNodes: PGNMoveNode[]
): string {
	const expectedMoveHints = Array.from(
		new Set(
			nextNodes.map((node) => {
				const comment = node.moveComment?.trim();
				const algebraic = moveToLongAlgebraic(node.move);
				if (comment) return `${algebraic} (${comment})`;
				if (nextNodes.length > 1) return `${algebraic}`;
				return algebraic;
			})
		)
	);
	const expectedStr = expectedMoveHints.join(' or ');
	return `Move "${moveToLongAlgebraic(actualMove)}" does not match ${openingName}. Expected ${expectedStr}.`;
}

export function createBoardFromOpeningNode(
	opening: Opening,
	destNode: PGNMoveNode | null
): Either<ChessBoard, Error> {
	const nodeLine = collectPGNNodesLine(opening.rootNode, destNode);
	if (!nodeLine) return [, new Error('No node line found')];

	const board = new ChessBoard();
	const [, fenError] = loadFen(board, opening.fen);
	if (fenError) {
		return [, new Error(fenError.message)];
	}
	board.generateLegalMoves();
	for (const node of nodeLine) {
		const move = board.makeMove(
			node.move.fromSquare,
			node.move.toSquare,
			node.move.promotion ?? undefined
		);
		if (!move) {
			return [, new Error(`Failed to make move: ${node.move.fromSquare} -> ${node.move.toSquare}`)];
		}
	}
	return [board];
}

function collectPGNNodesLine(
	rootNode: PGNMoveNode,
	destNode: PGNMoveNode | null
): PGNMoveNode[] | null {
	if (!destNode) return [];
	const nodes: PGNMoveNode[] = [];
	const dfs = (current: PGNMoveNode): boolean => {
		nodes.push(current);
		if (current === destNode) {
			return true;
		}
		if (current.next) {
			for (const nextNode of [current.next, ...current.next.variations]) {
				if (dfs(nextNode)) return true;
			}
		}
		nodes.pop();
		return false;
	};
	for (const firstNode of [rootNode, ...rootNode.variations]) {
		if (dfs(firstNode)) return nodes;
	}
	return null;
}
