/**
 * External dependencies
 */
import { connect } from 'react-redux';
import classnames from 'classnames';
import { throttle, reduce, noop } from 'lodash';

/**
 * WordPress dependencies
 */
import { __ } from '@wordpress/i18n';
import { Component } from '@wordpress/element';
import { serialize, getDefaultBlock, createBlock } from '@wordpress/blocks';
import { IconButton } from '@wordpress/components';
import { keycodes } from '@wordpress/utils';

/**
 * Internal dependencies
 */
import VisualEditorBlock from './block';
import BlockDropZone from './block-drop-zone';
import Inserter from '../../inserter';
import {
	getBlockUids,
	getBlockInsertionPoint,
	isBlockInsertionPointVisible,
	getMultiSelectedBlocksStartUid,
	getMultiSelectedBlocksEndUid,
	getMultiSelectedBlocks,
	getMultiSelectedBlockUids,
} from '../../selectors';
import { insertBlock, multiSelect } from '../../actions';

const INSERTION_POINT_PLACEHOLDER = '[[insertion-point]]';
const { ENTER } = keycodes;

class VisualEditorBlockList extends Component {
	constructor( props ) {
		super( props );
		this.state = {
			showContinueWritingControls: false,
		};
		this.onSelectionStart = this.onSelectionStart.bind( this );
		this.onSelectionChange = this.onSelectionChange.bind( this );
		this.onSelectionEnd = this.onSelectionEnd.bind( this );
		this.onCopy = this.onCopy.bind( this );
		this.onCut = this.onCut.bind( this );
		this.setBlockRef = this.setBlockRef.bind( this );
		this.appendDefaultBlock = this.appendDefaultBlock.bind( this );
		this.setLastClientY = this.setLastClientY.bind( this );
		this.onPointerMove = throttle( this.onPointerMove.bind( this ), 250 );
		this.onPlaceholderKeyDown = this.onPlaceholderKeyDown.bind( this );
		this.toggleContinueWritingControls = this.toggleContinueWritingControls.bind( this );
		// Browser does not fire `*move` event when the pointer position changes
		// relative to the document, so fire it with the last known position.
		this.onScroll = () => this.onPointerMove( { clientY: this.lastClientY } );

		this.lastClientY = 0;
		this.refs = {};
	}

	componentDidMount() {
		document.addEventListener( 'copy', this.onCopy );
		document.addEventListener( 'cut', this.onCut );
		window.addEventListener( 'mousemove', this.setLastClientY );
		window.addEventListener( 'touchmove', this.setLastClientY );
	}

	componentWillUnmount() {
		document.removeEventListener( 'copy', this.onCopy );
		document.removeEventListener( 'cut', this.onCut );
		window.removeEventListener( 'mousemove', this.setLastClientY );
		window.removeEventListener( 'touchmove', this.setLastClientY );
	}

	setLastClientY( { clientY } ) {
		this.lastClientY = clientY;
	}

	setBlockRef( ref, uid ) {
		if ( ref === null ) {
			delete this.refs[ uid ];
		} else {
			this.refs = {
				...this.refs,
				[ uid ]: ref,
			};
		}
	}

	onPointerMove( { clientY } ) {
		const BUFFER = 60;
		const { multiSelectedBlocks } = this.props;
		const y = clientY + window.pageYOffset;

		// If there is no selection yet, make the use move at least BUFFER px
		// away from the block with the pointer.
		if (
			! multiSelectedBlocks.length &&
			y - this.startLowerBoundary < BUFFER &&
			this.startUpperBoundary - y < BUFFER
		) {
			return;
		}

		const key = this.coordMapKeys.reduce( ( acc, topY ) => y > topY ? topY : acc );

		this.onSelectionChange( this.coordMap[ key ] );
	}

	onCopy( event ) {
		const { multiSelectedBlocks } = this.props;

		if ( multiSelectedBlocks.length ) {
			const serialized = serialize( multiSelectedBlocks );

			event.clipboardData.setData( 'text/plain', serialized );
			event.clipboardData.setData( 'text/html', serialized );
			event.preventDefault();
		}
	}

	onCut( event ) {
		const { multiSelectedBlockUids } = this.props;

		this.onCopy( event );

		if ( multiSelectedBlockUids.length ) {
			this.props.onRemove( multiSelectedBlockUids );
		}
	}

	onSelectionStart( uid ) {
		const { pageYOffset } = window;
		const boundaries = this.refs[ uid ].getBoundingClientRect();

		// Create a Y coödinate map to unique block IDs.
		this.coordMap = reduce( this.refs, ( acc, node, blockUid ) => ( {
			...acc,
			[ pageYOffset + node.getBoundingClientRect().top ]: blockUid,
		} ), {} );
		// Cache an array of the Y coödrinates for use in `onPointerMove`.
		this.coordMapKeys = Object.keys( this.coordMap );
		this.selectionAtStart = uid;

		this.startUpperBoundary = pageYOffset + boundaries.top;
		this.startLowerBoundary = pageYOffset + boundaries.bottom;

		window.addEventListener( 'mousemove', this.onPointerMove );
		window.addEventListener( 'touchmove', this.onPointerMove );
		window.addEventListener( 'scroll', this.onScroll );
		window.addEventListener( 'mouseup', this.onSelectionEnd );
		window.addEventListener( 'touchend', this.onSelectionEnd );
	}

	onSelectionChange( uid ) {
		const { onMultiSelect, selectionStart, selectionEnd } = this.props;
		const { selectionAtStart } = this;
		const isAtStart = selectionAtStart === uid;

		if ( ! selectionAtStart ) {
			return;
		}

		if ( isAtStart && selectionStart ) {
			onMultiSelect( null, null );
		}

		if ( ! isAtStart && selectionEnd !== uid ) {
			onMultiSelect( selectionAtStart, uid );
		}
	}

	onSelectionEnd() {
		// Cancel throttled calls.
		this.onPointerMove.cancel();

		delete this.coordMap;
		delete this.coordMapKeys;
		delete this.selectionAtStart;
		delete this.startUpperBoundary;
		delete this.startLowerBoundary;

		window.removeEventListener( 'mousemove', this.onPointerMove );
		window.removeEventListener( 'touchmove', this.onPointerMove );
		window.removeEventListener( 'scroll', this.onScroll );
		window.removeEventListener( 'mouseup', this.onSelectionEnd );
		window.removeEventListener( 'touchend', this.onSelectionEnd );
	}

	onPlaceholderKeyDown( event ) {
		if ( event.keyCode === ENTER ) {
			this.appendDefaultBlock();
		}
	}

	appendDefaultBlock() {
		const newBlock = createBlock( getDefaultBlock() );
		this.props.onInsertBlock( newBlock );
	}

	insertBlock( name ) {
		const newBlock = createBlock( name );
		this.props.onInsertBlock( newBlock );
	}

	toggleContinueWritingControls( showContinueWritingControls ) {
		return () => this.setState( { showContinueWritingControls } );
	}

	render() {
		const {
			blocks,
			showInsertionPoint,
			insertionPoint,
		} = this.props;

		const blocksWithInsertionPoint = showInsertionPoint
			? [
				...blocks.slice( 0, insertionPoint ),
				INSERTION_POINT_PLACEHOLDER,
				...blocks.slice( insertionPoint ),
			]
			: blocks;
		const continueWritingClassname = classnames( 'editor-visual-editor__continue-writing', {
			'is-showing-controls': this.state.showContinueWritingControls,
		} );

		return (
			<div>
				{ !! blocks.length && blocksWithInsertionPoint.map( ( uid ) => {
					if ( uid === INSERTION_POINT_PLACEHOLDER ) {
						return (
							<div
								key={ INSERTION_POINT_PLACEHOLDER }
								className="editor-visual-editor__insertion-point"
							/>
						);
					}

					return (
						<VisualEditorBlock
							key={ uid }
							uid={ uid }
							blockRef={ ( ref ) => this.setBlockRef( ref, uid ) }
							onSelectionStart={ () => this.onSelectionStart( uid ) }
						/>
					);
				} ) }
				{ ! blocks.length &&
					<div className="editor-visual-editor__placeholder">
						<BlockDropZone />
						<input
							type="text"
							readOnly
							value={ __( 'Write your story' ) }
							onFocus={ this.appendDefaultBlock }
							onClick={ noop }
							onKeyDown={ noop }
						/>
					</div>
				}
				<div
					className={ continueWritingClassname }
					onFocus={ this.toggleContinueWritingControls( true ) }
					onBlur={ this.toggleContinueWritingControls( false ) }
				>
					<Inserter position="top right" />
					<IconButton
						icon="editor-paragraph"
						className="editor-inserter__block"
						onClick={ () => this.insertBlock( 'core/paragraph' ) }
						label={ __( 'Insert paragraph block' ) }
					>
						{ __( 'Paragraph' ) }
					</IconButton>
					<IconButton
						icon="format-image"
						className="editor-inserter__block"
						onClick={ () => this.insertBlock( 'core/image' ) }
						label={ __( 'Insert image block' ) }
					>
						{ __( 'Image' ) }
					</IconButton>
				</div>
			</div>
		);
	}
}

export default connect(
	( state ) => ( {
		blocks: getBlockUids( state ),
		insertionPoint: getBlockInsertionPoint( state ),
		showInsertionPoint: isBlockInsertionPointVisible( state ),
		selectionStart: getMultiSelectedBlocksStartUid( state ),
		selectionEnd: getMultiSelectedBlocksEndUid( state ),
		multiSelectedBlocks: getMultiSelectedBlocks( state ),
		multiSelectedBlockUids: getMultiSelectedBlockUids( state ),
	} ),
	( dispatch ) => ( {
		onInsertBlock( block ) {
			dispatch( insertBlock( block ) );
		},
		onMultiSelect( start, end ) {
			dispatch( multiSelect( start, end ) );
		},
		onRemove( uids ) {
			dispatch( { type: 'REMOVE_BLOCKS', uids } );
		},
	} )
)( VisualEditorBlockList );
