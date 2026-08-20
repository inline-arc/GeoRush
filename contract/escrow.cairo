// BlitzEscrow: a stateful STRK20 anonymizer (helper) contract for GeoRush.
//
// Unlike the stateless swap/Vesu helpers, this contract keeps its own commitment map
// so funds can be escrowed behind a secret and claimed later — even by someone who
// is not yet registered with the privacy pool.
//
// The privacy pool calls `privacy_invoke` via the protocol's INVOKE_SELECTOR during
// InvokeExternal. The pool first withdraws tokens to this contract, then calls
// privacy_invoke, then credits the returned Span<OpenNoteDeposit> back into open notes.
//
// This is an unofficial example, not reviewed or audited by StarkWare.
use privacy::objects::OpenNoteDeposit;
use starknet::ContractAddress;

/// Entry stored per commitment in the escrow.
#[derive(Serde, Copy, Drop, PartialEq, Debug, starknet::Store)]
pub struct CommitmentEntry {
    pub token: ContractAddress,
    pub amount: u128,
    pub claimed: bool,
}

/// Operation to perform on the escrow.
#[derive(Serde, Copy, Drop, PartialEq, Debug)]
pub enum EscrowOperation {
    Deposit,
    Claim,
}

#[starknet::interface]
pub trait IBlitzEscrow<T> {
    /// Returns the commitment entry for a given hash.
    /// All fields are zero if it does not exist.
    fn get_commitment(self: @T, commitment_hash: felt252) -> CommitmentEntry;

    /// Called by the privacy contract via the `INVOKE_SELECTOR`.
    ///
    /// Dispatches on `operation`:
    ///
    /// **Deposit** - Stores a commitment backed by tokens the pool already transferred to this
    /// contract. Returns an empty span (tokens stay in escrow).
    /// - `commitment_hash` - `poseidon(ESCROW_COMMITMENT_TAG, secret)` computed off-chain.
    /// - `token` - ERC-20 token address.
    /// - `amount` - Token amount to escrow.
    /// - `secret`, `note_id` - ignored.
    ///
    /// **Claim** - Verifies `hash(secret)` matches a stored commitment, marks it claimed,
    /// approves the caller (privacy contract) to pull tokens, and returns the deposit instruction.
    /// - `secret` - The preimage whose hash matches the stored commitment.
    /// - `note_id` - The open note identifier (computed by the SDK and passed in calldata).
    /// - `commitment_hash`, `token`, `amount` - ignored.
    fn privacy_invoke(
        ref self: T,
        operation: EscrowOperation,
        commitment_hash: felt252,
        token: ContractAddress,
        amount: u128,
        secret: felt252,
        note_id: felt252,
    ) -> Span<OpenNoteDeposit>;
}

/// Domain-separation tag for escrow commitment hashes.
pub const ESCROW_COMMITMENT_TAG: felt252 = 'ESCROW_COMMITMENT_TAG:V1';

pub mod errors {
    pub const ZERO_COMMITMENT_HASH: felt252 = 'ZERO_COMMITMENT_HASH';
    pub const ZERO_TOKEN: felt252 = 'ZERO_TOKEN';
    pub const ZERO_AMOUNT: felt252 = 'ZERO_AMOUNT';
    pub const COMMITMENT_EXISTS: felt252 = 'COMMITMENT_EXISTS';
    pub const COMMITMENT_NOT_FOUND: felt252 = 'COMMITMENT_NOT_FOUND';
    pub const ALREADY_CLAIMED: felt252 = 'ALREADY_CLAIMED';
    pub const CALLER_NOT_PRIVACY: felt252 = 'CALLER_NOT_PRIVACY';
}

/// Computes the commitment hash from a secret using domain-separated Poseidon.
pub fn compute_commitment_hash(secret: felt252) -> felt252 {
    core::poseidon::poseidon_hash_span([ESCROW_COMMITMENT_TAG, secret].span())
}

#[starknet::contract]
pub mod BlitzEscrow {
    use core::num::traits::Zero;
    use openzeppelin::interfaces::token::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
    use privacy::objects::OpenNoteDeposit;
    use starknet::storage::{
        StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::get_caller_address;
    use super::{
        CommitmentEntry, EscrowOperation, IBlitzEscrow, compute_commitment_hash, errors,
    };

    #[storage]
    struct Storage {
        privacy_contract: ContractAddress,
        commitments: starknet::storage::Map<felt252, CommitmentEntry>,
    }

    #[constructor]
    fn constructor(ref self: ContractState, privacy_contract: ContractAddress) {
        self.privacy_contract.write(privacy_contract);
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        EscrowDeposit: EscrowDeposit,
        EscrowClaim: EscrowClaim,
    }

    #[derive(Drop, starknet::Event)]
    pub struct EscrowDeposit {
        pub commitment_hash: felt252,
        pub token: ContractAddress,
        pub amount: u128,
    }

    #[derive(Drop, starknet::Event)]
    pub struct EscrowClaim {
        pub commitment_hash: felt252,
        pub token: ContractAddress,
        pub amount: u128,
        pub note_id: felt252,
    }

    #[abi(embed_v0)]
    pub impl BlitzEscrowImpl of IBlitzEscrow<ContractState> {
        fn get_commitment(self: @ContractState, commitment_hash: felt252) -> CommitmentEntry {
            self.commitments.read(commitment_hash)
        }

        fn privacy_invoke(
            ref self: ContractState,
            operation: EscrowOperation,
            commitment_hash: felt252,
            token: ContractAddress,
            amount: u128,
            secret: felt252,
            note_id: felt252,
        ) -> Span<OpenNoteDeposit> {
            let privacy_addr = self.privacy_contract.read();
            assert(get_caller_address() == privacy_addr, errors::CALLER_NOT_PRIVACY);

            match operation {
                EscrowOperation::Deposit => {
                    assert(commitment_hash.is_non_zero(), errors::ZERO_COMMITMENT_HASH);
                    assert(token.is_non_zero(), errors::ZERO_TOKEN);
                    assert(amount.is_non_zero(), errors::ZERO_AMOUNT);

                    let existing = self.commitments.read(commitment_hash);
                    assert(existing.token.is_zero(), errors::COMMITMENT_EXISTS);

                    self
                        .commitments
                        .write(
                            commitment_hash,
                            CommitmentEntry { token, amount, claimed: false },
                        );

                    self
                        .emit(
                            Event::EscrowDeposit(
                                EscrowDeposit {
                                    commitment_hash,
                                    token,
                                    amount,
                                },
                            ),
                        );

                    // Tokens already transferred by the pool via Withdraw.
                    // Return empty span so the pool credits nothing yet.
                    [].span()
                },
                EscrowOperation::Claim => {
                    let commitment_hash = compute_commitment_hash(secret);
                    let entry = self.commitments.read(commitment_hash);
                    assert(entry.token.is_non_zero(), errors::COMMITMENT_NOT_FOUND);
                    assert(!entry.claimed, errors::ALREADY_CLAIMED);

                    self
                        .commitments
                        .write(
                            commitment_hash,
                            CommitmentEntry { claimed: true, ..entry },
                        );

                    // Approve the privacy contract to pull the escrowed tokens.
                    IERC20Dispatcher { contract_address: entry.token }
                        .approve(spender: privacy_addr, amount: entry.amount.into());

                    self
                        .emit(
                            Event::EscrowClaim(
                                EscrowClaim {
                                    commitment_hash,
                                    token: entry.token,
                                    amount: entry.amount,
                                    note_id,
                                },
                            ),
                        );

                    // Tell the pool to credit the open note with the escrowed tokens.
                    [OpenNoteDeposit { note_id, token: entry.token, amount: entry.amount }].span()
                },
            }
        }
    }
}
