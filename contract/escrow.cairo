use starknet::ContractAddress;

#[derive(Drop, Serde, starknet::Store)]
pub struct Session {
    pub user: ContractAddress,
    pub stake: u256,
    pub settled: bool,
    pub success: bool,
}

#[starknet::interface]
pub trait IBlitzEscrow<TContractState> {
    fn stake(ref self: TContractState, session_id: felt252, amount: u256);
    fn settle_session(ref self: TContractState, session_id: felt252, focus_score: u64);
    fn get_session(self: @TContractState, session_id: felt252) -> Session;
}

#[starknet::contract]
pub mod BlitzEscrow {
    use super::{Session, IBlitzEscrow};
    use starknet::ContractAddress;
    use starknet::get_caller_address;
    use starknet::storage::{
        StoragePointerReadAccess, StoragePointerWriteAccess,
        StorageMapReadAccess, StorageMapWriteAccess, Map
    };

    #[storage]
    struct Storage {
        owner: ContractAddress,
        treasury: ContractAddress,
        sessions: Map::<felt252, Session>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        SessionStaked: SessionStaked,
        SessionSettled: SessionSettled,
    }

    #[derive(Drop, starknet::Event)]
    struct SessionStaked {
        session_id: felt252,
        user: ContractAddress,
        stake: u256,
    }

    #[derive(Drop, starknet::Event)]
    struct SessionSettled {
        session_id: felt252,
        user: ContractAddress,
        success: bool,
        reward: u256,
    }

    #[constructor]
    fn constructor(ref self: ContractState, owner: ContractAddress, treasury: ContractAddress) {
        self.owner.write(owner);
        self.treasury.write(treasury);
    }

    #[abi(embed_v0)]
    impl BlitzEscrowImpl of IBlitzEscrow<ContractState> {
        fn stake(ref self: ContractState, session_id: felt252, amount: u256) {
            let caller = get_caller_address();
            let session = Session {
                user: caller,
                stake: amount,
                settled: false,
                success: false,
            };
            self.sessions.write(session_id, session);
            self.emit(SessionStaked { session_id, user: caller, stake: amount });
        }

        fn settle_session(ref self: ContractState, session_id: felt252, focus_score: u64) {
            let caller = get_caller_address();
            let owner = self.owner.read();
            assert(caller == owner, 'Only owner can settle');
            let session = self.sessions.read(session_id);
            assert(!session.settled, 'Already settled');
            let success = focus_score >= 85;
            let reward: u256 = if success {
                session.stake + (session.stake * 20 / 100)
            } else {
                0
            };
            let updated = Session {
                user: session.user,
                stake: session.stake,
                settled: true,
                success,
            };
            self.sessions.write(session_id, updated);
            self.emit(SessionSettled {
                session_id,
                user: session.user,
                success,
                reward,
            });
        }

        fn get_session(self: @ContractState, session_id: felt252) -> Session {
            self.sessions.read(session_id)
        }
    }
}