/**
 * Internal dependencies
 */
import { createBlocksFromMarkup } from '../factory';
import { parseWithGrammar } from '../parser';
import normaliseBlocks from './normalise-blocks';
import stripAttributes from './strip-attributes';
import commentRemover from './comment-remover';
import createUnwrapper from './create-unwrapper';
import isInlineContent from './is-inline-content';
import formattingTransformer from './formatting-transformer';
import msListConverter from './ms-list-converter';
import listMerger from './list-merger';
import imageCorrector from './image-corrector';
import blockquoteNormaliser from './blockquote-normaliser';
import { deepFilter, isInvalidInline, isNotWhitelisted } from './utils';

export default function( { content: HTML, inline } ) {
	HTML = HTML.replace( /<meta[^>]+>/, '' );

	// Block delimiters detected.
	if ( ! inline && HTML.indexOf( '<!-- wp:' ) !== -1 ) {
		return parseWithGrammar( HTML );
	}

	// Context dependent filters. Needs to run before we remove nodes.
	HTML = deepFilter( HTML, [
		msListConverter,
	] );

	HTML = deepFilter( HTML, [
		listMerger,
		imageCorrector,
		// Add semantic formatting before attributes are stripped.
		formattingTransformer,
		stripAttributes,
		commentRemover,
		createUnwrapper( isNotWhitelisted ),
		blockquoteNormaliser,
	] );

	// Inline paste.
	if ( inline || isInlineContent( HTML ) ) {
		// Allows us to ask for this information when we get a report.
		window.console.log( 'Processed inline HTML:\n\n', HTML );

		return HTML;
	}

	HTML = deepFilter( HTML, [
		createUnwrapper( isInvalidInline ),
	] );

	HTML = normaliseBlocks( HTML );

	// Allows us to ask for this information when we get a report.
	window.console.log( 'Processed HTML piece:\n\n', HTML );

	return createBlocksFromMarkup( HTML );
}
